"use client";

import { useEffect, useRef, useState } from "react";
import { readAgentState } from "./state";
import type { BoardState } from "./state";

export type SyncStatus =
  | "loading"
  | "saving"
  | "saved"
  /** Someone else saved first; their board was loaded instead. */
  | "conflict"
  /** The server has no database configured; changes are not kept. */
  | "unavailable"
  | "error";

/** The parts of the CopilotKit agent the sync needs. */
export type SyncedAgent = {
  state: unknown;
  setState(state: BoardState): void;
  isRunning?: boolean;
  subscribe?(subscriber: { onRunFinalized?(): void }): {
    unsubscribe(): void;
  };
};

type StoredBoard = { board: BoardState | null; version: number | null };

/** How often an idle page checks for changes by the other team member. */
export const POLL_INTERVAL_MS = 15_000;

/**
 * Keeps the agent's board in sync with the shared board on the server:
 * loads it on start, saves it after every assistant run, and picks up
 * changes from the other team member while idle.
 *
 * Pass `ready: false` while CopilotKit still hands out its provisional
 * agent; syncing starts (and restarts) once the real agent is there.
 */
export function useSharedBoard(agent: SyncedAgent, ready = true): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>("loading");
  const agentRef = useRef(agent);
  agentRef.current = agent;

  useEffect(() => {
    if (!ready) return;
    setStatus("loading");
    let version: number | null = null;
    let savedJson: string | null = null;
    let busy = false;
    let stopped = false;

    const update = (next: SyncStatus) => {
      if (!stopped) setStatus(next);
    };

    function adopt(stored: { board: BoardState; version: number }) {
      version = stored.version;
      savedJson = JSON.stringify(stored.board);
      agentRef.current.setState(stored.board);
    }

    async function request(init?: RequestInit): Promise<Response | null> {
      try {
        return await fetch("/api/board", {
          cache: "no-store",
          ...init,
          headers: { "content-type": "application/json", ...init?.headers },
        });
      } catch {
        update("error");
        return null;
      }
    }

    async function save(): Promise<void> {
      const board = readAgentState(agentRef.current.state);
      const json = JSON.stringify(board);
      if (json === savedJson) return;
      update("saving");
      const response = await request({
        method: "PUT",
        body: JSON.stringify({ board, baseVersion: version }),
      });
      if (!response) return;
      if (response.ok) {
        version = ((await response.json()) as { version: number }).version;
        savedJson = json;
        update("saved");
      } else if (response.status === 409) {
        const { current } = (await response.json()) as {
          current: { board: BoardState; version: number } | null;
        };
        if (current) adopt(current);
        update("conflict");
      } else {
        update(response.status === 503 ? "unavailable" : "error");
      }
    }

    async function load(): Promise<void> {
      const response = await request();
      if (!response) return;
      if (response.status === 503) {
        stopped = true;
        setStatus("unavailable");
        return;
      }
      if (!response.ok) return update("error");
      const stored = (await response.json()) as StoredBoard;
      if (stored.board && stored.version !== null) {
        // A local change that could not be saved yet (e.g. network error).
        const unsaved =
          savedJson !== null &&
          JSON.stringify(readAgentState(agentRef.current.state)) !== savedJson;
        if (stored.version !== version) {
          adopt({ board: stored.board, version: stored.version });
          update(unsaved ? "conflict" : "saved");
        } else if (unsaved) {
          await save();
        }
      } else {
        // Nothing saved yet: the current (starter) board becomes the shared one.
        await save();
      }
    }

    /** Runs one sync step at a time, never during an assistant run. */
    async function run(step: () => Promise<void>) {
      if (busy || stopped || agentRef.current.isRunning) return;
      busy = true;
      try {
        await step();
      } finally {
        busy = false;
      }
    }

    void run(load);
    const subscription = agentRef.current.subscribe?.({
      // Let the final state settle before reading it.
      onRunFinalized: () => {
        setTimeout(() => void run(save), 0);
      },
    });
    const refresh = () => {
      if (document.visibilityState === "visible") void run(load);
    };
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      stopped = true;
      subscription?.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [agent, ready]);

  return status;
}
