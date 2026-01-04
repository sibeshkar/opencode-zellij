import type { Plugin } from "@opencode-ai/plugin";
import { loadPluginConfig } from "./config-loader";
import { isInZellij, getPluginPath, sendToZellij, getZellijSessionName } from "./zellij";
import type { OpenCodeEvent, SessionState } from "./types";

export { OpenCodeZellijConfigSchema, type OpenCodeZellijConfig } from "./config";

/**
 * Extract a title from the conversation messages or directory
 */
function extractTitle(
  messages: Array<{ role: string; content: string }> | undefined,
  directory: string
): string {
  if (messages && messages.length > 0) {
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg?.content) {
      const firstLine = firstUserMsg.content.split("\n")[0] || "";
      const truncated = firstLine.slice(0, 30).trim();
      return truncated || directory.split("/").pop() || "opencode";
    }
  }
  return directory.split("/").pop() || "opencode";
}

/**
 * OpenCode plugin for Zellij integration
 *
 * This plugin:
 * 1. Auto-initializes the Zellij WASM plugin on load
 * 2. Hooks into todo.updated events to track task progress
 * 3. Sends updates to the Zellij plugin via pipe
 * 4. The Zellij plugin updates tab names and provides a session switcher
 */
export const ZellijPlugin: Plugin = async ({ directory }) => {
  // Check if running inside Zellij
  if (!isInZellij()) {
    // Not in Zellij, plugin is a no-op
    return {};
  }

  // Load configuration
  const config = loadPluginConfig(directory);

  console.log("[opencode-zellij] Plugin initialized in Zellij environment");
  console.log("[opencode-zellij] Config:", {
    auto_rename_tabs: config.auto_rename_tabs,
  });

  // Session state
  let currentState: SessionState | null = null;
  let lastTitle = "";
  let initialized = false;

  // Initialize the Zellij plugin
  const initializeZellijPlugin = () => {
    if (initialized) return;

    sendToZellij({
      type: "init",
    });
    initialized = true;
    console.log("[opencode-zellij] Sent init message to Zellij plugin");
  };

  // Send session update
  const sendSessionUpdate = () => {
    if (!currentState || !config.auto_rename_tabs) return;

    sendToZellij({
      type: "update",
      session_id: currentState.sessionId,
      title: currentState.title,
      todos_done: currentState.todosDone,
      todos_total: currentState.todosTotal,
    });
  };

  // Send session end
  const sendSessionEnd = () => {
    if (!currentState) return;

    sendToZellij({
      type: "end",
      session_id: currentState.sessionId,
    });

    currentState = null;
  };

  // Initialize on first event (ensures Zellij plugin is running)
  const ensureInitialized = () => {
    if (!initialized) {
      initializeZellijPlugin();
    }
  };

  return {
    event: async ({ event }: { event: OpenCodeEvent }) => {
      ensureInitialized();

      // Handle session created
      if (event.type === "session.created") {
        const sessionId = getZellijSessionName() || event.session?.id || `session_${Date.now()}`;
        currentState = {
          sessionId,
          title: "",
          todosDone: 0,
          todosTotal: 0,
        };
        sendSessionUpdate();
      }

      // Handle todo updates
      if (event.type === "todo.updated") {
        const todos = event.todos || [];
        const done = todos.filter((t) => t.status === "completed").length;
        const total = todos.length;

        if (currentState) {
          currentState.todosDone = done;
          currentState.todosTotal = total;
          sendSessionUpdate();
        } else {
          // No session yet, create one
          currentState = {
            sessionId: getZellijSessionName() || `session_${Date.now()}`,
            title: lastTitle,
            todosDone: done,
            todosTotal: total,
          };
          sendSessionUpdate();
        }
      }

      // Handle session idle - extract title from conversation
      if (event.type === "session.idle") {
        const title = extractTitle(event.messages, directory);

        if (title !== lastTitle) {
          lastTitle = title;
          if (currentState) {
            currentState.title = title;
            sendSessionUpdate();
          }
        }
      }

      // Handle session deleted/ended
      if (event.type === "session.deleted") {
        sendSessionEnd();
      }
    },

    // Cleanup handler
    unload: async () => {
      sendSessionEnd();
    },
  };
};

export default ZellijPlugin;
