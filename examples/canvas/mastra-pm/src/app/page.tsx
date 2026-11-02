"use client";

import {
  useAgent,
  useFrontendTool,
  CopilotSidebar,
  CopilotChatConfigurationProvider,
} from "@copilotkit/react-core/v2";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { z } from "zod";
import { chatLabels } from "@/lib/chatLabels";
import { createInitialState, isEmptyState, readAgentState } from "@/lib/state";
import { useSharedBoard } from "@/lib/useSharedBoard";
import type { SyncStatus } from "@/lib/useSharedBoard";
import { ProjectContainer } from "./components/ProjectContainer";

/** SaXer blue; the assistant can change it with the setThemeColor tool. */
const DEFAULT_THEME_COLOR = "#1d4e89";

const SYNC_LABELS: Record<SyncStatus, string> = {
  loading: "Board wird geladen …",
  saving: "Wird gespeichert …",
  saved: "Gespeichert",
  conflict:
    "Das Board wurde inzwischen geändert und neu geladen. Bitte die letzte Anfrage wiederholen.",
  unavailable: "Nicht gespeichert: kein Speicher eingerichtet",
  error: "Speichern fehlgeschlagen, neuer Versuch folgt",
};

/** Share one agent and conversation between the project board and chat. */
export default function CopilotKitPage() {
  return (
    <CopilotChatConfigurationProvider agentId="default">
      <ProjectManager />
    </CopilotChatConfigurationProvider>
  );
}

/** Render the board from validated agent state and register its browser tools. */
function ProjectManager() {
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const { agent, isReady } = useAgent();
  const state = readAgentState(agent.state);
  const syncStatus = useSharedBoard(agent, isReady);

  useEffect(() => {
    if (isEmptyState(agent.state)) agent.setState(createInitialState());
  }, [agent]);

  useFrontendTool({
    name: "setThemeColor",
    agentId: "default",
    description: "Change the board's theme color (Farbe des Boards ändern).",
    parameters: z.object({
      themeColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .describe("A six-digit CSS hex color, such as #008000"),
    }),
    handler: async ({ themeColor: nextColor }) => {
      setThemeColor(nextColor);
      return `Changed the theme to ${nextColor}`;
    },
  });

  return (
    <main
      className="h-screen w-full"
      style={{ "--copilot-kit-primary-color": themeColor } as CSSProperties}
    >
      <div
        style={{ backgroundColor: themeColor }}
        className="h-screen flex justify-center items-center flex-col transition-colors duration-300 p-6"
      >
        <ProjectContainer state={state} />
        <p
          role="status"
          data-sync={syncStatus}
          className="mt-3 text-sm text-white/90"
        >
          {SYNC_LABELS[syncStatus]}
        </p>
      </div>
      <CopilotSidebar defaultOpen labels={chatLabels} />
    </main>
  );
}
