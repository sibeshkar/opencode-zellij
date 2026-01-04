import { $ } from "bun";
import { join, dirname } from "path";

// Get the path to the WASM plugin (for reference in instructions)
const __dirname = dirname(new URL(import.meta.url).pathname);
const wasmPath = join(__dirname, "..", "assets", "opencode-zellij.wasm");

export const PLUGIN_PATH = `file:${wasmPath}`;

export interface ZellijMessage {
  type: "init" | "update" | "end" | "show" | "hide" | "toggle";
  session_id?: string;
  title?: string;
  todos_done?: number;
  todos_total?: number;
}

/**
 * Send a message to the Zellij plugin via pipe
 * 
 * NOTE: The plugin must be loaded first via:
 *   zellij action start-or-reload-plugin "file:$(pwd)/assets/opencode-zellij.wasm"
 * 
 * This sends to already-running plugins, it does NOT launch new instances.
 */
export async function sendMessage(message: ZellijMessage): Promise<void> {
  const payload = JSON.stringify(message);
  
  console.log(`Sending message: ${message.type}`);
  console.log(`Payload: ${payload}`);
  
  try {
    // Use spawn with detached to avoid blocking on plugin response
    // NOTE: No --plugin flag - sends to already-running plugins only
    const proc = Bun.spawn(
      ["zellij", "pipe", "--name", "opencode", "--", payload],
      {
        stdout: "ignore",
        stderr: "pipe",
      }
    );
    
    // Wait a short time for errors, then detach
    await sleep(500);
    
    // Check if there was an immediate error
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`zellij pipe failed: ${stderr}`);
    }
    
    console.log("✓ Message sent successfully\n");
  } catch (error) {
    console.error("✗ Failed to send message:", error);
    throw error;
  }
}

/**
 * Check if running inside Zellij and remind about plugin loading
 */
export function checkZellij(): void {
  if (!process.env.ZELLIJ) {
    console.error("✗ Error: Not running inside Zellij");
    console.error("  Please run these tests from within a Zellij session");
    process.exit(1);
  }
  console.log("✓ Running inside Zellij\n");
  console.log("NOTE: Make sure the plugin is loaded first:");
  console.log(`  zellij action start-or-reload-plugin "${PLUGIN_PATH}"\n`);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
