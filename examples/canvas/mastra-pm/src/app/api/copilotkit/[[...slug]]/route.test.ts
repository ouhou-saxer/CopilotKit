// @vitest-environment node
import { expect, test, vi } from "vitest";

/** Headers each agent run received from the runtime. */
const runHeaders = vi.hoisted(() => [] as Record<string, string>[]);

vi.mock("@/agent", async () => {
  const { HttpAgent } = await import("@ag-ui/client");
  class RecordingAgent extends HttpAgent {
    run(input: Parameters<HttpAgent["run"]>[0]) {
      runHeaders.push({ ...this.headers });
      // HttpAgent's observable is lazy, so this never sends a request. Reuse
      // its Observable class (rxjs is not a direct dependency) for an empty run.
      const Observable = super.run(input).constructor as new (
        subscribe: (subscriber: { complete(): void }) => void,
      ) => ReturnType<HttpAgent["run"]>;
      return new Observable((subscriber) => subscriber.complete());
    }
  }
  return {
    createLocalAgents: () => ({
      default: new RecordingAgent({ url: "http://unused.test" }),
    }),
  };
});

/** Load a route with local agents stubbed; the runtime routing remains real. */
async function setup() {
  const route: Record<string, unknown> = await import("./route");
  return {
    request: async (method: string, path: string) => {
      const handler = route[method];
      expect(typeof handler).toBe("function");
      if (typeof handler !== "function")
        throw new Error(`Missing ${method} route`);
      return await handler(
        new Request(`http://localhost/api/copilotkit${path}`, { method }),
      );
    },
  };
}

test("GET exposes the registered project agent through runtime discovery", async () => {
  const { request } = await setup();

  const response = await request("GET", "/info");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    agents: { default: expect.any(Object) },
  });
});

test("POST reaches the v2 run endpoint and reports invalid input", async () => {
  const { request } = await setup();

  const response = await request("POST", "/agent/default/run");

  expect(response.status).toBe(400);
});

test("POST does not forward the board login to the agent", async () => {
  const route = await import("./route");
  runHeaders.length = 0;

  const response = await route.POST(
    new Request("http://localhost/api/copilotkit/agent/default/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${btoa("saxer:geheim")}`,
        "x-board-test": "kept",
      },
      body: JSON.stringify({
        threadId: "thread-1",
        runId: "run-1",
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: {},
      }),
    }),
  );
  await response.text();

  expect(runHeaders.length).toBeGreaterThan(0);
  for (const headers of runHeaders) {
    const names = Object.keys(headers).map((name) => name.toLowerCase());
    expect(names).not.toContain("authorization");
    expect(names).toContain("x-board-test");
  }
});
