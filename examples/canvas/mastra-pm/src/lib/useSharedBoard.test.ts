import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createInitialState } from "./state";
import type { BoardState } from "./state";
import { POLL_INTERVAL_MS, useSharedBoard } from "./useSharedBoard";
import type { SyncedAgent } from "./useSharedBoard";

const board = (projectName: string): BoardState => ({
  ...createInitialState(),
  projectName,
});

/** A fake agent whose run end can be triggered from the test. */
function createAgent(state: unknown = createInitialState()) {
  const listeners: Array<() => void> = [];
  const agent = {
    state,
    isRunning: false as boolean,
    setState: vi.fn((next: BoardState) => {
      agent.state = next;
    }),
    subscribe: (subscriber: { onRunFinalized?(): void }) => {
      if (subscriber.onRunFinalized) listeners.push(subscriber.onRunFinalized);
      return { unsubscribe: vi.fn() };
    },
    finishRun: async () => {
      await act(async () => {
        listeners.forEach((listener) => listener());
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  } satisfies SyncedAgent & Record<string, unknown>;
  return agent;
}

type Reply = { status: number; body: unknown };

/** Fake /api/board: answers queued replies, records PUT bodies. */
function mockServer(...replies: Reply[]) {
  const puts: Array<{ board: BoardState; baseVersion: number | null }> = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") puts.push(JSON.parse(String(init.body)));
    const reply = replies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts, fetchMock, replies };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("loads the shared board from the server", async () => {
  mockServer({ status: 200, body: { board: board("Gemeinsam"), version: 4 } });
  const agent = createAgent();

  const { result } = renderHook(() => useSharedBoard(agent));

  await waitFor(() => expect(result.current).toBe("saved"));
  expect(agent.setState).toHaveBeenCalledWith(
    expect.objectContaining({ projectName: "Gemeinsam" }),
  );
});

test("an empty server receives the current board as the first version", async () => {
  const { puts } = mockServer(
    { status: 200, body: { board: null, version: null } },
    { status: 200, body: { version: 1 } },
  );
  const agent = createAgent(board("Startboard"));

  const { result } = renderHook(() => useSharedBoard(agent));

  await waitFor(() => expect(result.current).toBe("saved"));
  expect(puts).toEqual([
    {
      board: expect.objectContaining({ projectName: "Startboard" }),
      baseVersion: null,
    },
  ]);
});

test("saves the board after an assistant run, based on the loaded version", async () => {
  const { puts } = mockServer(
    { status: 200, body: { board: board("Vorher"), version: 4 } },
    { status: 200, body: { version: 5 } },
  );
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  agent.state = board("Nachher");
  await agent.finishRun();

  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0]).toEqual({
    board: expect.objectContaining({ projectName: "Nachher" }),
    baseVersion: 4,
  });
  await waitFor(() => expect(result.current).toBe("saved"));
});

test("a run without board changes does not save", async () => {
  const { puts, fetchMock } = mockServer({
    status: 200,
    body: { board: board("Unverändert"), version: 2 },
  });
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  await agent.finishRun();

  expect(puts).toHaveLength(0);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a conflict loads the other person's board and says so", async () => {
  mockServer(
    { status: 200, body: { board: board("Alt"), version: 1 } },
    {
      status: 409,
      body: {
        error: "conflict",
        current: { board: board("Von Sascha"), version: 2 },
      },
    },
  );
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  agent.state = board("Von Yves");
  await agent.finishRun();

  await waitFor(() => expect(result.current).toBe("conflict"));
  expect(agent.setState).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectName: "Von Sascha" }),
  );
});

test("a server without a database is reported and not asked again", async () => {
  const { fetchMock } = mockServer({
    status: 503,
    body: { error: "storage-unavailable" },
  });
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));

  await waitFor(() => expect(result.current).toBe("unavailable"));
  agent.state = board("Geändert");
  await agent.finishRun();

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(agent.setState).not.toHaveBeenCalled();
});

test("an idle page picks up a newer board from the other person", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockServer(
    { status: 200, body: { board: board("Version 1"), version: 1 } },
    { status: 200, body: { board: board("Von Sascha"), version: 2 } },
  );
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  });

  await waitFor(() =>
    expect(agent.setState).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectName: "Von Sascha" }),
    ),
  );
});

test("does not replace the board while the assistant is running", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { fetchMock } = mockServer({
    status: 200,
    body: { board: board("Version 1"), version: 1 },
  });
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  agent.isRunning = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
  });

  expect(fetchMock).toHaveBeenCalledOnce();
});

test("an unsaved change is saved again on the next check", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { puts } = mockServer(
    { status: 200, body: { board: board("Version 1"), version: 1 } },
    { status: 500, body: {} },
    { status: 200, body: { board: board("Version 1"), version: 1 } },
    { status: 200, body: { version: 2 } },
  );
  const agent = createAgent();
  const { result } = renderHook(() => useSharedBoard(agent));
  await waitFor(() => expect(result.current).toBe("saved"));

  agent.state = board("Neu");
  await agent.finishRun();
  await waitFor(() => expect(result.current).toBe("error"));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  });

  await waitFor(() => expect(result.current).toBe("saved"));
  expect(puts).toHaveLength(2);
  expect(puts[1]).toEqual({
    board: expect.objectContaining({ projectName: "Neu" }),
    baseVersion: 1,
  });
});

test("waits for the real agent and then syncs into it", async () => {
  mockServer(
    { status: 200, body: { board: board("Gemeinsam"), version: 3 } },
    { status: 200, body: { board: board("Gemeinsam"), version: 3 } },
  );
  const provisional = createAgent();
  const real = createAgent();
  const { result, rerender } = renderHook(
    ({ agent, ready }) => useSharedBoard(agent, ready),
    { initialProps: { agent: provisional, ready: false } },
  );

  expect(result.current).toBe("loading");
  expect(fetch).not.toHaveBeenCalled();

  rerender({ agent: real, ready: true });

  await waitFor(() => expect(result.current).toBe("saved"));
  expect(provisional.setState).not.toHaveBeenCalled();
  expect(real.setState).toHaveBeenCalledWith(
    expect.objectContaining({ projectName: "Gemeinsam" }),
  );
});
