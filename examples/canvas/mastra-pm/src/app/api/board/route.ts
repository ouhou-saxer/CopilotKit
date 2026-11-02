import { z } from "zod";
import { getBoardStore } from "@/lib/boardStore";
import { BoardStateSchema } from "@/lib/state";

// Always read the current board; never serve a cached copy.
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

const SaveRequestSchema = z.object({
  board: BoardStateSchema,
  baseVersion: z.number().int().positive().nullable(),
});

const storageUnavailable = () =>
  Response.json({ error: "storage-unavailable" }, { status: 503 });

/** The shared board: `{ board, version }`, or both null when nothing is saved yet. */
export async function GET() {
  const store = getBoardStore();
  if (!store) return storageUnavailable();
  const stored = await store.read();
  return Response.json(stored ?? { board: null, version: null });
}

/**
 * Saves the board if `baseVersion` is still the stored version.
 * Answers 409 with the stored board when someone else saved in between.
 */
export async function PUT(request: Request) {
  const store = getBoardStore();
  if (!store) return storageUnavailable();

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    return Response.json({ error: "too-large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
  const parsed = SaveRequestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "invalid-board" }, { status: 400 });

  const result = await store.save(parsed.data.board, parsed.data.baseVersion);
  if (result.ok) return Response.json({ version: result.version });
  return Response.json(
    { error: "conflict", current: result.current },
    { status: 409 },
  );
}
