/**
 * Test: Show the plugin UI
 * 
 * This sends a show message which should:
 * 1. Make the plugin UI visible as a floating pane
 * 2. Display the session list
 */

import { checkZellij, sendMessage } from "./utils";

checkZellij();

console.log("=== Test: Show Plugin UI ===\n");

await sendMessage({
  type: "show",
});

console.log("Expected behavior:");
console.log("- Plugin UI should appear as a floating pane");
console.log("- Should show list of sessions (if any registered)");
console.log("- Press Esc to close the UI");
