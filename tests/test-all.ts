/**
 * Test: Run all tests in sequence
 * 
 * This runs all tests with delays between them to observe behavior
 * 
 * PREREQUISITE: Load the plugin first with:
 *   zellij action start-or-reload-plugin "file:$(pwd)/assets/opencode-zellij.wasm"
 */

import { checkZellij, sendMessage, sleep } from "./utils";

checkZellij();

console.log("╔════════════════════════════════════════════╗");
console.log("║     Running All Tests in Sequence          ║");
console.log("╚════════════════════════════════════════════╝\n");

// Test 1: Initialize
console.log("━━━ Step 1/6: Initialize Plugin ━━━\n");
await sendMessage({
  type: "init",
});
console.log("Waiting 2 seconds...\n");
await sleep(2000);

// Test 2: First update
console.log("━━━ Step 2/6: Register Session ━━━\n");
await sendMessage({
  type: "update",
  session_id: "test-session-all",
  title: "All-tests session",
  todos_done: 1,
  todos_total: 4,
});
console.log("Tab should now show (1/4)");
console.log("Waiting 2 seconds...\n");
await sleep(2000);

// Test 3: Progress update
console.log("━━━ Step 3/6: Update Progress ━━━\n");
await sendMessage({
  type: "update",
  session_id: "test-session-all",
  title: "Making progress",
  todos_done: 2,
  todos_total: 4,
});
console.log("Tab should now show (2/4)");
console.log("Waiting 2 seconds...\n");
await sleep(2000);

// Test 4: Show UI (NOTE: This switches to the plugin's tab if on different tab)
console.log("━━━ Step 4/6: Show Plugin UI ━━━\n");
await sendMessage({
  type: "show",
});
console.log("Plugin UI should be visible now");
console.log("NOTE: 'show' via pipe switches to plugin's tab. Use keybind for cross-tab access.");
console.log("Press Esc to close, or wait 3 seconds...\n");
await sleep(3000);

// Test 5: Hide UI
console.log("━━━ Step 5/6: Hide Plugin UI ━━━\n");
await sendMessage({
  type: "hide",
});
console.log("Plugin UI should be hidden now");
console.log("Waiting 2 seconds...\n");
await sleep(2000);

// Test 6: End session
console.log("━━━ Step 6/6: End Session ━━━\n");
await sendMessage({
  type: "end",
  session_id: "test-session-all",
});
console.log("Session removed, tab name should be restored\n");

console.log("╔════════════════════════════════════════════╗");
console.log("║           All Tests Complete!              ║");
console.log("╚════════════════════════════════════════════╝\n");

console.log("Summary of expected behaviors:");
console.log("1. Plugin initialized");
console.log("2. Tab was renamed with todo progress (1/4 then 2/4)");
console.log("3. Plugin UI appeared (may have switched tabs)");
console.log("4. Plugin UI was hidden");
console.log("5. Session was removed and tab name restored");
console.log("");
console.log("To toggle the plugin from any tab, configure a keybind:");
console.log("  bind \"Ctrl Shift o\" {");
console.log("    LaunchOrFocusPlugin \"file:~/.config/zellij/plugins/opencode-zellij.wasm\" {");
console.log("      floating true");
console.log("      move_to_focused_tab true");
console.log("    }");
console.log("  }");
