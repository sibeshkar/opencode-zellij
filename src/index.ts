import type { Plugin } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { appendFileSync } from "fs";
import { join } from "path";
import { loadPluginConfig } from "./config-loader";
import { isInZellij, getPluginPath, sendToZellij, getZellijSessionName } from "./zellij";
import type { SessionState, SessionStatus } from "./types";

// Debug logging to file
const DEBUG = process.env.OPENCODE_ZELLIJ_DEBUG === "true" || true; // Enable by default for now
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
  debugLog("Permission tracking ENABLED - will track permission.asked and permission.replied events");

  // Session state
  let currentState: SessionState | null = null;
  let lastTitle = "";
  let initialized = false;
  
  // Track pending permissions for the current session
  let pendingPermissions: Set<string> = new Set();
  
  // Debug: track all event types seen
  const seenEventTypes: Set<string> = new Set();
  let permissionEventCount = 0;

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
      status: currentState.status,
    };
    
    // Extra logging for permission-related status
    if (currentState.status === "asking") {
      debugLog("=== SENDING ASKING STATUS TO ZELLIJ ===", { 
        message,
        pendingPermissions: Array.from(pendingPermissions)
      });
    }
    
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
    pendingPermissions.clear();
  };

  // Initialize on first event (ensures Zellij plugin is running)
  const ensureInitialized = () => {
    if (!initialized) {
      initializeZellijPlugin();
    }
  };

  return {
    event: async ({ event }: { event: Event }) => {
      // Track all event types for debugging
      if (!seenEventTypes.has(event.type)) {
        seenEventTypes.add(event.type);
        debugLog("NEW EVENT TYPE DISCOVERED", { type: event.type, allTypes: Array.from(seenEventTypes) });
      }
      
      // Log every event received (truncated)
      debugLog("Event received", { type: event.type, keys: Object.keys(event), event: JSON.stringify(event).slice(0, 500) });
      
      // Special handling for permission-related events - log full details
      if (event.type.includes("permission")) {
        permissionEventCount++;
        debugLog("=== PERMISSION EVENT DETECTED ===", { 
          count: permissionEventCount,
          type: event.type, 
          fullEvent: event,
          currentState: currentState,
          pendingPermissionsSize: pendingPermissions.size,
          pendingPermissionIds: Array.from(pendingPermissions)
        });
      }

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
          status: "idle",
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
            status: "idle",
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

      // Handle session status changes (new event)
      if (event.type === "session.status") {
        const props = event.properties as { status?: { type: SessionStatus } };
        const statusType = props?.status?.type;
        debugLog("session.status handler", { statusType });
        
        if (statusType && currentState && currentState.status !== statusType) {
          currentState.status = statusType;
          sendSessionUpdate();
        }
      }

      // Handle session idle (deprecated, backwards compatibility)
      if (event.type === "session.idle") {
        debugLog("session.idle handler");
        if (currentState && currentState.status !== "idle") {
          currentState.status = "idle";
          pendingPermissions.clear();
          sendSessionUpdate();
        }
      }

      // Handle permission request - set status to "asking"
      // Note: permission.asked is not in SDK types but is sent by OpenCode
      if ((event as { type: string }).type === "permission.asked") {
        const props = (event as { properties?: { id?: string; sessionID?: string } }).properties;
        const oldStatus = currentState?.status;
        debugLog("permission.asked handler ENTERED", { 
          props,
          hasId: !!props?.id,
          currentState,
          oldStatus,
          pendingPermissionsBefore: Array.from(pendingPermissions)
        });
        
        if (props?.id) {
          pendingPermissions.add(props.id);
          debugLog("Added permission to pending", { 
            permissionId: props.id, 
            pendingPermissionsAfter: Array.from(pendingPermissions) 
          });
          
          if (!currentState) {
            // Create a session state if we don't have one yet
            debugLog("Creating session state for permission event");
            currentState = {
              sessionId: props?.sessionID || getZellijSessionName() || `session_${Date.now()}`,
              title: lastTitle,
              todosDone: 0,
              todosTotal: 0,
              status: "asking",
            };
            sendSessionUpdate();
          } else if (currentState.status !== "asking") {
            currentState.status = "asking";
            debugLog("STATUS CHANGED TO ASKING", { oldStatus, newStatus: "asking" });
            sendSessionUpdate();
          } else {
            debugLog("Status already asking, no change needed");
          }
        } else {
          debugLog("WARNING: permission.asked has no id in props", { props, fullEvent: event });
        }
      }

      // Handle permission reply - clear asking status if no more pending permissions
      if (event.type === "permission.replied") {
        const props = event.properties as { requestID?: string; sessionID?: string; reply?: string };
        const oldStatus = currentState?.status;
        debugLog("permission.replied handler ENTERED", { 
          props,
          hasRequestID: !!props?.requestID,
          reply: props?.reply,
          currentState,
          oldStatus,
          pendingPermissionsBefore: Array.from(pendingPermissions)
        });
        
        if (props?.requestID) {
          const hadPermission = pendingPermissions.has(props.requestID);
          pendingPermissions.delete(props.requestID);
          debugLog("Removed permission from pending", { 
            permissionId: props.requestID,
            wasTracked: hadPermission,
            pendingPermissionsAfter: Array.from(pendingPermissions),
            remainingCount: pendingPermissions.size
          });
          
          if (pendingPermissions.size === 0 && currentState && currentState.status === "asking") {
            // Go back to busy since we're still processing after permission granted
            currentState.status = "busy";
            debugLog("STATUS CHANGED FROM ASKING TO BUSY", { oldStatus: "asking", newStatus: "busy" });
            sendSessionUpdate();
          } else {
            debugLog("Status not changed after permission.replied", {
              reason: pendingPermissions.size > 0 
                ? `Still ${pendingPermissions.size} pending permissions` 
                : currentState?.status !== "asking" 
                  ? `Status is ${currentState?.status}, not asking`
                  : "No currentState"
            });
          }
        } else {
          debugLog("WARNING: permission.replied has no requestID in props", { props, fullEvent: event });
        }
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
