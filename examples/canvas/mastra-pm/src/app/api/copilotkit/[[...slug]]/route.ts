import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { createLocalAgents } from "@/agent";

const runtime = new CopilotRuntime({
  agents: createLocalAgents(),
  // The Authorization header carries the board login (see src/middleware.ts).
  // Never forward it to the agent: the model provider would receive the board
  // password in place of the server's OPENAI_API_KEY.
  forwardHeaders: { deny: ["authorization"] },
});
const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export const GET = handler;
export const POST = handler;
