// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { createSupabaseBoardStore } from "./boardStore";
import { createInitialState } from "./state";

const URL = "https://example-ref.supabase.co";

const board = (projectName: string) => ({
  ...createInitialState(),
  projectName,
});

/**
 * A fake Supabase REST API with the same rules as supabase/board.sql:
 * GET /rest/v1/board and POST /rest/v1/rpc/save_board.
 */
function fakeSupabase() {
  let row: { data: unknown; version: number } | null = null;
  const requests: Array<{ url: string; headers: Headers; body?: unknown }> = [];
  const fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, headers: new Headers(init?.headers), body });
    if (url === `${URL}/rest/v1/board?id=eq.1&select=data,version`)
      return Response.json(row ? [row] : []);
    if (url === `${URL}/rest/v1/rpc/save_board`) {
      const { p_data, p_base_version } = body;
      if (p_base_version === null) {
        if (row) return Response.json(null);
        row = { data: p_data, version: 1 };
        return Response.json(1);
      }
      if (!row || row.version !== p_base_version) return Response.json(null);
      row = { data: p_data, version: row.version + 1 };
      return Response.json(row.version);
    }
    return Response.json({ message: "not found" }, { status: 404 });
  });
  return {
    fetch,
    requests,
    setRow: (next: typeof row) => {
      row = next;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("an empty table has no board", async () => {
  const api = fakeSupabase();
  const store = createSupabaseBoardStore({
    url: URL,
    secretKey: "sb_secret_test",
    fetch: api.fetch,
  });

  expect(await store.read()).toBeNull();
});

test("saves count up the version and are read back", async () => {
  const api = fakeSupabase();
  const store = createSupabaseBoardStore({
    url: `${URL}/`,
    secretKey: "sb_secret_test",
    fetch: api.fetch,
  });

  expect(await store.save(board("Erste Fassung"), null)).toEqual({
    ok: true,
    version: 1,
  });
  expect(await store.save(board("Zweite Fassung"), 1)).toEqual({
    ok: true,
    version: 2,
  });
  const stored = await store.read();
  expect(stored?.version).toBe(2);
  expect(stored?.board.projectName).toBe("Zweite Fassung");
});

test("a save based on an old version returns the current board", async () => {
  const api = fakeSupabase();
  const store = createSupabaseBoardStore({
    url: URL,
    secretKey: "sb_secret_test",
    fetch: api.fetch,
  });
  await store.save(board("Yves"), null);
  await store.save(board("Sascha"), 1);

  const result = await store.save(board("Veraltet"), 1);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.current?.version).toBe(2);
    expect(result.current?.board.projectName).toBe("Sascha");
  }
});

test("unreadable stored data is treated as no board", async () => {
  const api = fakeSupabase();
  api.setRow({ data: { kaputt: true }, version: 3 });
  const store = createSupabaseBoardStore({
    url: URL,
    secretKey: "sb_secret_test",
    fetch: api.fetch,
  });

  expect(await store.read()).toBeNull();
});

test("a secret key goes only in apikey, a legacy JWT key also in Authorization", async () => {
  const api = fakeSupabase();
  await createSupabaseBoardStore({
    url: URL,
    secretKey: "sb_secret_test",
    fetch: api.fetch,
  }).read();
  await createSupabaseBoardStore({
    url: URL,
    secretKey: "eyJ.legacy.jwt",
    fetch: api.fetch,
  }).read();

  const [secret, legacy] = api.requests;
  expect(secret.headers.get("apikey")).toBe("sb_secret_test");
  expect(secret.headers.get("authorization")).toBeNull();
  expect(legacy.headers.get("apikey")).toBe("eyJ.legacy.jwt");
  expect(legacy.headers.get("authorization")).toBe("Bearer eyJ.legacy.jwt");
});

test("Supabase errors are raised, not taken for an empty board", async () => {
  const store = createSupabaseBoardStore({
    url: URL,
    secretKey: "sb_secret_test",
    fetch: vi.fn(async () =>
      Response.json({ message: "permission denied" }, { status: 401 }),
    ),
  });

  await expect(store.read()).rejects.toThrow("401");
});

test("production uses Supabase when it is configured", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPABASE_URL", URL);
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  const api = fakeSupabase();
  vi.stubGlobal("fetch", api.fetch);
  try {
    const { getBoardStore } = await import("./boardStore");
    const store = getBoardStore();
    expect(store).not.toBeNull();
    await store?.read();
    expect(api.requests[0].url).toBe(
      `${URL}/rest/v1/board?id=eq.1&select=data,version`,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
