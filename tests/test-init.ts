/**
 * Test: Initialize the plugin
 * 
 * This sends an init message which should:
 * 1. Auto-bind Ctrl+Shift+o to show the plugin
 * 2. Keep the plugin hidden
 */

import { checkZellij, sendMessage } from "./utils";

checkZellij();

console.log("=== Test: Initialize Plugin ===\n");

await sendMessage({
  type: "init",
  keybind: "Ctrl Shift o",
  auto_bind: true,
});

console.log("Expected behavior:");
console.log("- Plugin should auto-bind Ctrl+Shift+o");
console.log("- Plugin should remain hidden");
console.log("- Press Ctrl+Shift+o to verify the keybind works");
