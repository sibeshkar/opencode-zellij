# Manual Tests for Zellij Plugin

These tests allow you to manually test the Zellij WASM plugin without installing the OpenCode plugin.

**Prerequisites:**
- You must be running inside Zellij
- The WASM plugin must be built (`make build-wasm`)

## Running Tests

```bash
# First, build the WASM plugin
cd ..
make build-wasm

# Then run tests from this directory
cd tests

# Test initialization (auto-binds Ctrl+Shift+o)
bun run test-init.ts

# Test session update (adds a session, renames tab)
bun run test-update.ts

# Test showing the UI (makes the plugin visible)
bun run test-show.ts

# Test session end (removes session, restores tab name)
bun run test-end.ts

# Run all tests in sequence
bun run test-all.ts
```

## Test Descriptions

### test-init.ts
Sends an `init` message to the plugin. This should:
- Auto-bind `Ctrl+Shift+o` to show the plugin
- Keep the plugin hidden

### test-update.ts
Sends an `update` message with session info. This should:
- Register a session in the current tab
- Rename the tab to include todo progress (e.g., `Tab 1 (2/5)`)

### test-update-multi.ts
Sends multiple updates to simulate todos progressing. Watch the tab name change.

### test-show.ts
Sends a `show` message. This should:
- Make the plugin UI visible as a floating pane
- Show the session list

### test-end.ts
Sends an `end` message. This should:
- Remove the session from the list
- Restore the original tab name

### test-all.ts
Runs all tests in sequence with delays to observe behavior.

## Manual Verification

After running tests, verify:

1. **After test-init**: Press `Ctrl+Shift+o` - should show the plugin (might be empty)
2. **After test-update**: Tab name should include `(2/5)`
3. **After test-show**: Plugin UI should be visible with session listed
4. **After test-end**: Tab name should be restored, session removed from list
