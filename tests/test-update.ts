/**
 * Test: Send a session update
 * 
 * This sends an update message which should:
 * 1. Register a session for the current tab
 * 2. Rename the tab to include todo progress
 */

import { checkZellij, sendMessage } from "./utils";

checkZellij();

console.log("=== Test: Session Update ===\n");

await sendMessage({
  type: "update",
  session_id: "test-session-1",
  title: "Testing the plugin",
  todos_done: 2,
  todos_total: 5,
});

console.log("Expected behavior:");
console.log("- Current tab should be renamed to include '(2/5)'");
console.log("- Session should appear in the switcher (press Ctrl+Shift+o)");
