// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { createInitialState } from "@/lib/state";

/** Load the route with a fresh store (in-memory database by default). */
async function setup(
  env: Record<string, string> = { BOARD_DB_URL: ":memory:" },
) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const route = await import("./route");
  const put = (body: unknown) =>
    route.PUT(
      new Request("http://localhost/api/board", {
        method: "PUT",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { get: () => route.GET(), put };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("an empty store answers with no board and no version", async () => {
  const { get } = await setup();

  const response = await get();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ board: null, version: null });
});

test("a saved board is returned with its version", async () => {
  const { get, put } = await setup();
  const board = { ...createInitialState(), projectName: "Gemeinsames Board" };

  const saved = await put({ board, baseVersion: null });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({ version: 1 });

  const body = await (await get()).json();
  expect(body.version).toBe(1);
  expect(body.board.projectName).toBe("Gemeinsames Board");
});

test("a save based on an old version is refused with the current board", async () => {
  const { put } = await setup();
  const board = createInitialState();
  await put({ board, baseVersion: null });
  await put({ board: { ...board, projectName: "Von Sascha" }, baseVersion: 1 });

  const response = await put({
    board: { ...board, projectName: "Von Yves" },
    baseVersion: 1,
  });

  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.current.version).toBe(2);
  expect(body.current.board.projectName).toBe("Von Sascha");
});

test("invalid requests are rejected", async () => {
  const { put } = await setup();

  expect((await put("kein json")).status).toBe(400);
  expect((await put({ board: { tasks: "x" }, baseVersion: null })).status).toBe(
    400,
  );
  expect(
    (await put({ board: createInitialState(), baseVersion: 0 })).status,
  ).toBe(400);
  expect((await put("x".repeat(200_001))).status).toBe(413);
});

test("production without a database answers 503", async () => {
  const { get, put } = await setup({
    NODE_ENV: "production",
    BOARD_DB_URL: "",
  });

  expect((await get()).status).toBe(503);
  expect(
    (await put({ board: createInitialState(), baseVersion: null })).status,
  ).toBe(503);
});
