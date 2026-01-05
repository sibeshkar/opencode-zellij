# opencode-zellij

Manage multiple OpenCode sessions across Zellij tabs with a harpoon-style session switcher.

## Features

- **Todo Progress in Tab Names**: Tab names automatically update to show todo progress and busy status (e.g., `myproject (3/5)*`)
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

  j/k: navigate  Enter: switch  c: clear D:clear all Esc: close 
```

## Installation (currently in development)

### Step 1: Git Clone this repo to a folder `/path/to/repo`

Run `bun install` or `npm install` in the repo folder and then run `bun build` to package it for use.
The Zellij plugin it uses is currently committed to the repo at `assets/opencode-zellij.wasm`, can be used as is on any platform.

Add to your `opencode.json`:

```json
{
  "plugin": ["/path/to/repo"]
}
```

### Step 2: Configure Keybind (Required)

Add to your `~/.config/zellij/config.kdl`:

```kdl
keybinds {
    shared_except "locked" {
        bind "Ctrl Shift o" {
            LaunchOrFocusPlugin "file:/path/to/repo/assets/plugins/opencode-zellij.wasm" {
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
    "file:/path/to/repo/assets/plugins/opencode-zellij.wasm" 
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
- Bun or Node.js/NPM
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



## License

MIT

## Credits

Inspired by:
- [harpoon](https://github.com/Nacho114/harpoon) - Zellij pane switcher
- [zjpane](https://github.com/FuriouZz/zjpane) - Zellij pane navigation
- [zjstatus](https://github.com/dj95/zjstatus) - Zellij status bar
