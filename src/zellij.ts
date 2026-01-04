import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { OpenCodeZellijConfig } from "./config";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the zellij binary path
 */
function findZellij(): string | null {
  if (process.env.ZELLIJ_PATH) {
    return process.env.ZELLIJ_PATH;
  }

  const home = process.env.HOME || "";
  const paths = [
    join(home, ".cargo", "bin", "zellij"),
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
    "/opt/homebrew/bin/zellij",
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fall back to PATH lookup
  return "zellij";
}

/**
 * Get the cache directory for storing the WASM plugin
 */
function getCacheDir(): string {
  const home = process.env.HOME || "";
  if (process.platform === "darwin") {
    return join(home, "Library", "Caches", "opencode-zellij");
  } else if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode-zellij");
  }
  // Linux and others use XDG_CACHE_HOME or ~/.cache
  return join(process.env.XDG_CACHE_HOME || join(home, ".cache"), "opencode-zellij");
}

/**
 * Get the path to the WASM plugin, copying bundled version to cache if needed
 */
export function getPluginPath(config: OpenCodeZellijConfig): string {
  // Use custom path if specified
  if (config.plugin_path) {
    return config.plugin_path.startsWith("file:")
      ? config.plugin_path
      : `file:${config.plugin_path}`;
  }

  // Check for bundled WASM in assets directory
  // Try multiple locations (dist vs src for dev)
  const possibleBundledPaths = [
    join(__dirname, "..", "assets", "opencode-zellij.wasm"),
    join(__dirname, "..", "..", "assets", "opencode-zellij.wasm"),
  ];

  let bundledPath: string | null = null;
  for (const p of possibleBundledPaths) {
    if (existsSync(p)) {
      bundledPath = p;
      break;
    }
  }

  if (!bundledPath) {
    console.error("[opencode-zellij] Bundled WASM plugin not found");
    console.error("[opencode-zellij] Checked paths:", possibleBundledPaths);
    throw new Error("Bundled WASM plugin not found. Please reinstall the package.");
  }

  // Copy to cache directory so zellij can access it via file: URL
  const cacheDir = getCacheDir();
  const cachedPath = join(cacheDir, "opencode-zellij.wasm");

  try {
    mkdirSync(cacheDir, { recursive: true });
    copyFileSync(bundledPath, cachedPath);
  } catch (err) {
    console.error("[opencode-zellij] Failed to copy WASM to cache:", err);
    // Fall back to bundled path
    return `file:${bundledPath}`;
  }

  return `file:${cachedPath}`;
}

/**
 * Message types for communication with the Zellij plugin
 */
export interface ZellijMessage {
  type: "init" | "update" | "end" | "show" | "hide" | "toggle";
  session_id?: string;
  title?: string;
  todos_done?: number;
  todos_total?: number;
}

/**
 * Send a message to the Zellij plugin via pipe
 * Uses fire-and-forget pattern to avoid blocking OpenCode
 * 
 * NOTE: This sends to already-running plugins listening on "opencode" pipe.
 * The plugin must be loaded first via keybind or zellij action.
 */
export function sendToZellij(message: ZellijMessage): void {
  if (!isInZellij()) {
    // Silently ignore if not in Zellij
    return;
  }

  const zellij = findZellij();
  if (!zellij) {
    console.error("[opencode-zellij] Could not find zellij binary");
    return;
  }

  const payload = JSON.stringify(message);

  try {
    const proc = spawn(
      zellij,
      ["pipe", "--name", "opencode", "--", payload],
      {
        detached: true,
        stdio: "ignore",
      }
    );
    proc.unref();
  } catch (error) {
    console.error("[opencode-zellij] Failed to send pipe message:", error);
  }
}

/**
 * Check if running inside Zellij
 */
export function isInZellij(): boolean {
  return !!process.env.ZELLIJ;
}

/**
 * Get the current Zellij session name
 */
export function getZellijSessionName(): string | null {
  return process.env.ZELLIJ_SESSION_NAME || null;
}
