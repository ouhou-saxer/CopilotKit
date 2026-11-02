// @vitest-environment node
import { createClient } from "@libsql/client";
import { expect, test } from "vitest";
import { createLibsqlBoardStore } from "./boardStore";
import { createInitialState } from "./state";

function setup() {
  const client = createClient({ url: ":memory:" });
  return { client, store: createLibsqlBoardStore(client) };
}

const board = (projectName: string) => ({
  ...createInitialState(),
  projectName,
});

test("an empty database has no board", async () => {
  const { store } = setup();
  expect(await store.read()).toBeNull();
});

test("the first save creates version 1, later saves count up", async () => {
  const { store } = setup();

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
  expect(stored?.board.tasks.length).toBeGreaterThan(0);
});

test("a save based on an old version never overwrites a newer board", async () => {
  const { store } = setup();
  await store.save(board("Yves"), null);
  await store.save(board("Sascha"), 1);

  const result = await store.save(board("Veraltet"), 1);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.current?.version).toBe(2);
    expect(result.current?.board.projectName).toBe("Sascha");
  }
  expect((await store.read())?.board.projectName).toBe("Sascha");
});

test("a second first save is a conflict, not an overwrite", async () => {
  const { store } = setup();
  await store.save(board("Zuerst"), null);

  const result = await store.save(board("Danach"), null);

  expect(result.ok).toBe(false);
  expect((await store.read())?.board.projectName).toBe("Zuerst");
});

test("unreadable stored data is treated as no board", async () => {
  const { client, store } = setup();
  await store.save(board("Gültig"), null);
  await client.execute("UPDATE board SET data = '{\"kaputt\":true}'");

  expect(await store.read()).toBeNull();
});
