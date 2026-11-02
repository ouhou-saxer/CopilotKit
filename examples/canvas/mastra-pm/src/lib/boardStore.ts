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

/** One board (row id 1) in a libSQL / SQLite database. */
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

let store: BoardStore | null | undefined;

/**
 * The board store configured for this server.
 *
 * - `BOARD_DB_URL` (and `BOARD_DB_AUTH_TOKEN` for Turso) when set.
 * - Otherwise a local file in development, so `pnpm dev` keeps the board.
 * - `null` in production without a database: the board then works, but
 *   is not saved, and the page says so.
 */
export function getBoardStore(): BoardStore | null {
  if (store !== undefined) return store;
  const url =
    process.env.BOARD_DB_URL ||
    (process.env.NODE_ENV === "production" ? "" : "file:.board-data.db");
  store = url
    ? createLibsqlBoardStore(
        createClient({ url, authToken: process.env.BOARD_DB_AUTH_TOKEN }),
      )
    : null;
  return store;
}
