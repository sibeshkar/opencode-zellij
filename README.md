# opencode-zellij

Manage multiple OpenCode sessions across Zellij tabs with a harpoon-style session switcher.

## Features

- **Todo Progress in Tab Names**: Tab names automatically update to show todo progress (e.g., `myproject (3/5)`)
- **Session Switcher**: Floating pane to quickly switch between tabs with active OpenCode sessions
- **Cross-Tab Navigation**: Switch to any OpenCode session from any tab

## Screenshots

```
  OpenCode Sessions
  ────────────────────────────

> [1] myproject-auth *
     "Implementing OAuth" (4/5)
  [2] api-refactor
     "Cleanup handlers" (2/3)
  [3] bugfix-login
     "Fix login flow" (0/2)

  j/k: navigate  Enter: switch  Esc: close
```

## Installation

### Step 1: Install the OpenCode Plugin

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-zellij"]
}
```

### Step 2: Copy the WASM Plugin

Copy the bundled WASM plugin to your Zellij plugins directory:

```bash
# Create plugins directory if it doesn't exist
mkdir -p ~/.config/zellij/plugins

# Copy from npm package (after installing)
cp node_modules/opencode-zellij/assets/opencode-zellij.wasm ~/.config/zellij/plugins/
```

### Step 3: Configure Keybind (Required)

Add to your `~/.config/zellij/config.kdl`:

```kdl
keybinds {
    shared_except "locked" {
        bind "Ctrl Shift o" {
            LaunchOrFocusPlugin "file:~/.config/zellij/plugins/opencode-zellij.wasm" {
                floating true
                move_to_focused_tab true
            }
        }
    }
}
```

**Important**: The `move_to_focused_tab true` option is required for the session switcher to work correctly from any tab.

### Alternative: Auto-Load on Session Start

Instead of (or in addition to) the keybind, you can auto-load the plugin when Zellij starts:

```kdl
load_plugins {
    "file:~/.config/zellij/plugins/opencode-zellij.wasm"
}
```

## Usage

1. Start Zellij and open OpenCode in one or more tabs
2. Press `Ctrl+Shift+o` (or your configured keybind) to open the session switcher
3. Navigate with:
   - `j` / `Down Arrow`: Move down
   - `k` / `Up Arrow`: Move up
   - `1-9`: Quick select by number
   - `Enter`: Switch to selected tab
   - `Esc` / `q`: Close switcher

Tab names automatically update to show todo progress as you work (e.g., `mytab (3/5)`).

## Configuration

Configuration file: `~/.config/opencode/opencode-zellij.json` (or `.opencode/opencode-zellij.json` per-project)

```json
{
  "$schema": "https://raw.githubusercontent.com/your-username/opencode-zellij/main/assets/opencode-zellij.schema.json",

  // Whether to auto-rename tabs with todo progress (default: true)
  "auto_rename_tabs": true,

  // Custom path to WASM plugin (default: bundled)
  "plugin_path": null
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_ZELLIJ_NO_TAB_RENAME` | Set to `"1"` to disable tab renaming |
| `OPENCODE_ZELLIJ_PLUGIN_PATH` | Override path to WASM plugin |

## Message Types

The plugin communicates via `zellij pipe`. Available message types:

| Type | Description | Notes |
|------|-------------|-------|
| `init` | Initialize plugin | Marks plugin as initialized |
| `update` | Update session info | Renames tab, updates session list |
| `end` | End session | Removes from list, restores tab name |
| `show` | Show plugin UI | ⚠️ Switches to plugin's tab |
| `hide` | Hide plugin UI | Works from any tab |
| `toggle` | Toggle plugin UI | Show if hidden, hide if shown |

**Note**: The `show` message via pipe will switch to the tab where the plugin was loaded. For cross-tab access, use the `LaunchOrFocusPlugin` keybind with `move_to_focused_tab true`.

## Development

### Prerequisites

- Rust with `wasm32-wasip1` target: `rustup target add wasm32-wasip1`
- Bun or Node.js
- Zellij

### Setup

```bash
# Install dependencies
npm install

# Build everything
make build
```

### Manual Testing

```bash
# Start a fresh Zellij session
zellij

# Load the plugin (once per session)
zellij action start-or-reload-plugin "file:$(pwd)/assets/opencode-zellij.wasm"

# Send test messages
zellij pipe --name opencode -- '{"type":"update","session_id":"test","title":"Test","todos_done":2,"todos_total":5}'
zellij pipe --name opencode -- '{"type":"show"}'
zellij pipe --name opencode -- '{"type":"hide"}'

# Or run the test suite
cd tests
bun run test-all.ts
```

### Project Structure

```
opencode-zellij/
├── src/                    # OpenCode plugin (TypeScript)
│   ├── index.ts            # Main plugin export
│   ├── config.ts           # Configuration schema
│   ├── config-loader.ts    # Config file loading
│   ├── zellij.ts           # Zellij CLI wrapper
│   └── types.ts            # TypeScript types
├── zellij-plugin/          # Zellij plugin (Rust)
│   └── src/
│       ├── main.rs         # Plugin logic
│       └── ui.rs           # UI rendering
├── assets/                 # Bundled WASM binary
├── tests/                  # Manual test scripts
└── .github/workflows/      # CI/CD
```

## Architecture

This plugin consists of two parts:

### OpenCode Plugin (TypeScript)

- Hooks into OpenCode events (`todo.updated`, `session.created`, `session.idle`)
- Sends updates to the Zellij plugin via `zellij pipe --name opencode`
- Uses `ZELLIJ_SESSION_NAME` as the session identifier

### Zellij Plugin (Rust/WASM)

- Receives updates via pipe messages
- Tracks sessions across tabs in memory
- Renders the floating session chooser UI
- Renames tabs to show todo progress

### Communication Flow

```
OpenCode                          Zellij Plugin
────────                          ─────────────
[startup] ─────► "init" ────────► mark initialized

todo.updated ──► "update" ──────► store session
                                  rename_tab()

[user presses keybind]
         ◄──── LaunchOrFocusPlugin ──────────────
                                  show floating UI
                                  (on current tab)

[user selects] ◄──────────────── switch_tab()
                                  hide_self()

session.deleted ► "end" ────────► remove session
                                  restore tab name
```

## Troubleshooting

### Plugin not loading

1. Make sure you're running inside Zellij (`echo $ZELLIJ` should output something)
2. Check that `opencode-zellij` is in your `opencode.json` plugins array
3. Verify the WASM file exists at the configured path
4. Check Zellij permissions were granted on first load

### Session switcher not showing

1. The keybind must use `LaunchOrFocusPlugin` with `move_to_focused_tab true`
2. Make sure the plugin was loaded (via keybind or `load_plugins`)
3. Check for keybind conflicts with other Zellij bindings

### Tab names not updating

1. Todo updates only show when there are todos (`total > 0`)
2. Make sure `auto_rename_tabs` is not disabled
3. Check that OpenCode is sending todo events

### Session switcher switches tabs unexpectedly

This happens when using `{"type":"show"}` via pipe instead of the keybind. The pipe message uses `show_self()` which always switches to the plugin's original tab. Use the `LaunchOrFocusPlugin` keybind for cross-tab access.

## License

MIT

## Credits

Inspired by:
- [harpoon](https://github.com/Nacho114/harpoon) - Zellij pane switcher
- [zjpane](https://github.com/FuriouZz/zjpane) - Zellij pane navigation
- [zjstatus](https://github.com/dj95/zjstatus) - Zellij status bar
