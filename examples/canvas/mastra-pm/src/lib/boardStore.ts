import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { BoardStateSchema } from "./state";
import type { BoardState } from "./state";

/** The shared board plus a version that increases with every save. */
export type StoredBoard = { board: BoardState; version: number };

export type SaveResult =
  | { ok: true; version: number }
  /** Someone saved in between; `current` is what is stored now. */
  | { ok: false; current: StoredBoard | null };

export interface BoardStore {
  read(): Promise<StoredBoard | null>;
  /**
   * Saves only if the stored version still equals `baseVersion`
   * (`null` = nothing stored yet), so a concurrent change is never overwritten.
   */
  save(board: BoardState, baseVersion: number | null): Promise<SaveResult>;
}

const RowSchema = z.object({ data: z.string(), version: z.number() });

/** One board (row id 1) in a local libSQL / SQLite database (development). */
export function createLibsqlBoardStore(client: Client): BoardStore {
  let ready: Promise<unknown> | undefined;
  const ensureTable = () =>
    (ready ??= client.execute(
      `CREATE TABLE IF NOT EXISTS board (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ));

  async function read(): Promise<StoredBoard | null> {
    await ensureTable();
    const result = await client.execute(
      "SELECT data, version FROM board WHERE id = 1",
    );
    const row = RowSchema.safeParse(result.rows[0]);
    if (!row.success) return null;
    const board = BoardStateSchema.safeParse(JSON.parse(row.data.data));
    return board.success
      ? { board: board.data, version: row.data.version }
      : null;
  }

  async function save(
    board: BoardState,
    baseVersion: number | null,
  ): Promise<SaveResult> {
    await ensureTable();
    const data = JSON.stringify(board);
    const now = new Date().toISOString();
    const result =
      baseVersion === null
        ? await client.execute({
            sql: `INSERT INTO board (id, data, version, updated_at)
                  VALUES (1, ?, 1, ?) ON CONFLICT (id) DO NOTHING`,
            args: [data, now],
          })
        : await client.execute({
            sql: `UPDATE board SET data = ?, version = version + 1, updated_at = ?
                  WHERE id = 1 AND version = ?`,
            args: [data, now, baseVersion],
          });
    if (result.rowsAffected === 1)
      return { ok: true, version: (baseVersion ?? 0) + 1 };
    return { ok: false, current: await read() };
  }

  return { read, save };
}

const SupabaseRowsSchema = z.array(
  z.object({ data: z.unknown(), version: z.number() }),
);

type SupabaseOptions = {
  /** Project URL, e.g. https://<ref>.supabase.co */
  url: string;
  /** Secret key (sb_secret_…) or legacy service_role key. Server-side only. */
  secretKey: string;
  fetch?: typeof fetch;
};

/**
 * The board in a Supabase table `board`, saved through the database function
 * `save_board` (see supabase/board.sql), which only writes if the version is
 * still `baseVersion`.
 */
export function createSupabaseBoardStore({
  url,
  secretKey,
  fetch: fetchImpl = fetch,
}: SupabaseOptions): BoardStore {
  const base = url.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    apikey: secretKey,
    "content-type": "application/json",
  };
  // Legacy keys are JWTs and also go in Authorization; sb_secret_ keys do not.
  if (secretKey.startsWith("eyJ"))
    headers.authorization = `Bearer ${secretKey}`;

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Supabase answered ${response.status} for ${path}`);
    return response.json();
  }

  async function read(): Promise<StoredBoard | null> {
    const rows = SupabaseRowsSchema.parse(
      await call("board?id=eq.1&select=data,version"),
    );
    const row = rows[0];
    if (!row) return null;
    const board = BoardStateSchema.safeParse(row.data);
    return board.success ? { board: board.data, version: row.version } : null;
  }

  async function save(
    board: BoardState,
    baseVersion: number | null,
  ): Promise<SaveResult> {
    const version = await call("rpc/save_board", {
      method: "POST",
      body: JSON.stringify({ p_data: board, p_base_version: baseVersion }),
    });
    if (typeof version === "number") return { ok: true, version };
    return { ok: false, current: await read() };
  }

  return { read, save };
}

let store: BoardStore | null | undefined;

/**
 * The board store configured for this server.
 *
 * - Supabase when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set.
 * - Otherwise, in development, a local SQLite file (`BOARD_LOCAL_DB`,
 *   default `.board-data.db`), so `pnpm dev` keeps the board.
 * - `null` in production without Supabase: the board then works, but is
 *   not saved, and the page says so.
 */
export function getBoardStore(): BoardStore | null {
  if (store !== undefined) return store;
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (supabaseUrl && secretKey) {
    store = createSupabaseBoardStore({ url: supabaseUrl, secretKey });
  } else if (process.env.NODE_ENV === "production") {
    store = null;
  } else {
    store = createLibsqlBoardStore(
      createClient({
        url: process.env.BOARD_LOCAL_DB || "file:.board-data.db",
      }),
    );
  }
  return store;
}
