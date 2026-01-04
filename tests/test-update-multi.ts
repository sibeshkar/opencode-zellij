/**
 * Test: Multiple session updates (simulate todo progress)
 * 
 * This sends multiple update messages to simulate todos being completed
 */

import { checkZellij, sendMessage, sleep } from "./utils";

checkZellij();

console.log("=== Test: Multiple Updates (Todo Progress) ===\n");

const updates = [
  { done: 0, total: 5, title: "Starting work" },
  { done: 1, total: 5, title: "First task done" },
  { done: 2, total: 5, title: "Making progress" },
  { done: 3, total: 5, title: "More than halfway" },
  { done: 4, total: 5, title: "Almost there" },
  { done: 5, total: 5, title: "All done!" },
];

for (const update of updates) {
  console.log(`Updating: (${update.done}/${update.total}) - ${update.title}`);
  
  await sendMessage({
    type: "update",
    session_id: "test-session-progress",
    title: update.title,
    todos_done: update.done,
    todos_total: update.total,
  });
  
  await sleep(1000); // Wait 1 second between updates
}

console.log("\nExpected behavior:");
console.log("- Tab name should have progressed from (0/5) to (5/5)");
console.log("- Session title should show 'All done!' in the switcher");
