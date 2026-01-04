/**
 * Test: End a session
 * 
 * This sends an end message which should:
 * 1. Remove the session from the list
 * 2. Restore the original tab name
 */

import { checkZellij, sendMessage } from "./utils";

checkZellij();

console.log("=== Test: End Session ===\n");

await sendMessage({
  type: "end",
  session_id: "test-session-1",
});

console.log("Expected behavior:");
console.log("- Session should be removed from the switcher");
console.log("- Tab name should be restored (no more todo count)");
