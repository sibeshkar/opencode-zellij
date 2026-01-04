import type { Plugin } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { appendFileSync } from "fs";
import { join } from "path";
import { loadPluginConfig } from "./config-loader";
import { isInZellij, getPluginPath, sendToZellij, getZellijSessionName } from "./zellij";
import type { SessionState } from "./types";

// Debug logging to file
const DEBUG = false;
const LOG_FILE = join("/Users/sk/Maya/research/clone/worktreefafo/tmp/zellij-opencode", "debug.log");

function debugLog(message: string, data?: unknown) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const line = data 
    ? `[${timestamp}] ${message}: ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore write errors
  }
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
  debugLog("Plugin loading", { directory, isInZellij: isInZellij(), ZELLIJ: process.env.ZELLIJ, ZELLIJ_SESSION_NAME: process.env.ZELLIJ_SESSION_NAME });

  // Check if running inside Zellij
  if (!isInZellij()) {
    debugLog("Not in Zellij, plugin is a no-op");
    return {};
  }

  // Load configuration
  const config = loadPluginConfig(directory);

  debugLog("Plugin initialized", { config });

  // Session state
  let currentState: SessionState | null = null;
  let lastTitle = "";
  let initialized = false;

  // Initialize the Zellij plugin
  const initializeZellijPlugin = () => {
    if (initialized) return;

    debugLog("Sending init message to Zellij");
    sendToZellij({
      type: "init",
    });
    initialized = true;
  };

  // Send session update
  const sendSessionUpdate = () => {
    debugLog("sendSessionUpdate called", { currentState, auto_rename_tabs: config.auto_rename_tabs });
    if (!currentState || !config.auto_rename_tabs) {
      debugLog("sendSessionUpdate skipped", { hasState: !!currentState, auto_rename_tabs: config.auto_rename_tabs });
      return;
    }

    const message = {
      type: "update" as const,
      session_id: currentState.sessionId,
      title: currentState.title,
      todos_done: currentState.todosDone,
      todos_total: currentState.todosTotal,
    };
    debugLog("Sending update to Zellij", message);
    sendToZellij(message);
  };

  // Send session end
  const sendSessionEnd = () => {
    if (!currentState) return;

    debugLog("Sending session end", { sessionId: currentState.sessionId });
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
    event: async ({ event }: { event: Event }) => {
      // Log every event received
      debugLog("Event received", { type: event.type, keys: Object.keys(event), event: JSON.stringify(event).slice(0, 500) });

      ensureInitialized();

      // Handle session created
      if (event.type === "session.created") {
        debugLog("session.created handler", { event });
        const props = event.properties as { info?: { id?: string; title?: string } };
        const sessionId = getZellijSessionName() || props?.info?.id || `session_${Date.now()}`;
        const title = props?.info?.title || "";
        currentState = {
          sessionId,
          title: typeof title === "string" ? title : "",
          todosDone: 0,
          todosTotal: 0,
        };
        sendSessionUpdate();
      }

      // Handle todo updates
      if (event.type === "todo.updated") {
        const props = event.properties as { todos?: Array<{ status: string }> };
        debugLog("todo.updated handler", { properties: props });
        const todos = props?.todos || [];
        debugLog("todos array", { todos, length: todos.length });
        const done = todos.filter((t) => t.status === "completed").length;
        const total = todos.length;
        debugLog("todo counts", { done, total });

        if (currentState) {
          currentState.todosDone = done;
          currentState.todosTotal = total;
          sendSessionUpdate();
        } else {
          // No session yet, create one
          debugLog("Creating new session for todo update");
          currentState = {
            sessionId: getZellijSessionName() || `session_${Date.now()}`,
            title: lastTitle,
            todosDone: done,
            todosTotal: total,
          };
          sendSessionUpdate();
        }
      }

      // Handle session updated - extract title
      if (event.type === "session.updated") {
        const props = event.properties as { info?: { title?: string } };
        const title = props?.info?.title;
        if (title && typeof title === "string" && title !== lastTitle) {
          debugLog("session.updated handler - title changed", { title });
          lastTitle = title;
          if (currentState) {
            currentState.title = title;
            sendSessionUpdate();
          }
        }
      }

      // Handle session idle
      if (event.type === "session.idle") {
        debugLog("session.idle handler");
        // Session idle doesn't have messages in properties, title comes from session.updated
      }

      // Handle session deleted/ended
      if (event.type === "session.deleted") {
        debugLog("session.deleted handler");
        sendSessionEnd();
      }
    },

    // Cleanup handler
    unload: async () => {
      debugLog("Plugin unloading");
      sendSessionEnd();
    },
  };
};

export default ZellijPlugin;
