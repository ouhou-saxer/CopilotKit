import { z } from "zod";
import { AreaSchema, UserSchema, TaskSchema, tasks, users } from "./types";

export const DEFAULT_PROJECT_NAME = "SaXer Immobilien & Verwaltungen";

export const AgentStateSchema = z.object({
  projectName: z.string(),
  projectDescription: z.string(),
  users: z.array(UserSchema),
  tasks: z.array(TaskSchema),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

/** Board tasks tolerate a missing or unknown area so older boards still render. */
const BoardTaskSchema = TaskSchema.extend({
  area: AreaSchema.optional().catch(undefined),
});

/** A complete board as shown and saved; tasks may lack an area. */
export const BoardStateSchema = AgentStateSchema.extend({
  tasks: z.array(BoardTaskSchema),
});

export type BoardTask = z.infer<typeof BoardTaskSchema>;
export type BoardUser = AgentState["users"][number];
export type BoardState = z.infer<typeof BoardStateSchema>;

/** Create independent starter data for a new conversation. */
export function createInitialState(): AgentState {
  return {
    projectName: DEFAULT_PROJECT_NAME,
    projectDescription:
      "Aufgaben für Vermietung, Bewirtschaftung, Bewertung und Verkauf in der Region Thun.",
    users: users.map((user) => ({ ...user })),
    tasks: tasks.map((task) => ({ ...task })),
  };
}

/** Seed only a new, empty state; never replace a hydrated or partial board. */
export function isEmptyState(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );
}

const StreamedStateSchema = z.object({
  projectName: z.string().catch(DEFAULT_PROJECT_NAME),
  projectDescription: z.string().catch(""),
  users: z.array(z.unknown()).catch([]),
  tasks: z.array(z.unknown()).catch([]),
});

/** Validate each streamed record so incomplete tool arguments cannot crash the board. */
export function readAgentState(value: unknown): BoardState {
  if (isEmptyState(value)) return createInitialState();
  const parsed = StreamedStateSchema.safeParse(value);
  if (!parsed.success)
    return {
      projectName: DEFAULT_PROJECT_NAME,
      projectDescription: "",
      users: [],
      tasks: [],
    };
  return {
    ...parsed.data,
    users: parsed.data.users.flatMap((user) => {
      const result = UserSchema.safeParse(user);
      return result.success ? [result.data] : [];
    }),
    tasks: parsed.data.tasks.flatMap((task) => {
      const result = BoardTaskSchema.safeParse(task);
      return result.success ? [result.data] : [];
    }),
  };
}
