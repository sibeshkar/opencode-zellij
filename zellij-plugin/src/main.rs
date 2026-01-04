mod ui;

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use zellij_tile::prelude::*;

/// Message format received from OpenCode plugin via zellij pipe
#[derive(Debug, Deserialize, Serialize)]
struct OpenCodeMessage {
    #[serde(rename = "type")]
    msg_type: String, // "init" | "update" | "end" | "show" | "hide" | "toggle"
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    pane_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    todos_done: Option<u32>,
    #[serde(default)]
    todos_total: Option<u32>,
    #[serde(default)]
    status: Option<String>, // "idle" | "busy" | "retry"
}

/// Information about an OpenCode session in a tab
#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub tab_index: usize,
    pub tab_name: String,
    pub session_id: String,
    pub title: String,
    pub todos_done: u32,
    pub todos_total: u32,
    pub status: String, // "idle" | "busy" | "retry"
}

/// Plugin state
#[derive(Default)]
struct State {
    /// Tab index -> Session info (only tabs with active OpenCode sessions)
    sessions: HashMap<usize, SessionInfo>,

    /// pane_id -> tab_index mapping (looked up from PaneManifest)
    pane_to_tab: HashMap<u32, usize>,

    /// Pane manifest from PaneUpdate events (maps tab_position -> Vec<PaneInfo>)
    pane_manifest: PaneManifest,

    /// All tabs from TabUpdate events
    tabs: Vec<TabInfo>,

    /// Current focused tab index
    current_tab_index: usize,

    /// UI selection state
    selected_index: usize,

    /// Whether the plugin UI is currently visible
    visible: bool,

    /// Sorted list of tab indices for UI rendering (cached)
    sorted_tab_indices: Vec<usize>,

    /// Whether we've received the first message (initialized)
    initialized: bool,

    /// Whether permissions have been granted
    has_permission_granted: bool,

    /// Whether permissions were denied (to show error)
    permission_denied: bool,
}

register_plugin!(State);

impl State {
    /// Handle the init message - mark plugin as initialized
    fn handle_init(&mut self) -> bool {
        self.initialized = true;
        true
    }

    /// Handle the show message - make the UI visible
    /// NOTE: This uses show_self() which switches to the plugin's tab.
    /// For cross-tab access, use LaunchOrFocusPlugin with move_to_focused_tab in Zellij config.
    fn handle_show(&mut self) -> bool {
        show_self(true);
        true
    }

    /// Handle the hide message - hide the UI
    fn handle_hide(&mut self) -> bool {
        hide_self();
        true
    }

    /// Handle the toggle message - show if hidden, hide if shown
    fn handle_toggle(&mut self) -> bool {
        if self.visible {
            hide_self();
        } else {
            show_self(true);
        }
        true
    }

    /// Handle keyboard input for the chooser UI
    fn handle_key(&mut self, key: KeyWithModifier) -> bool {
        if self.sessions.is_empty() {
            // No sessions, just hide on any key
            if matches!(key.bare_key, BareKey::Esc | BareKey::Enter) {
                hide_self();
            }
            return true;
        }

        match key.bare_key {
            // Navigation
            BareKey::Char('j') | BareKey::Down => {
                if self.selected_index < self.sorted_tab_indices.len().saturating_sub(1) {
                    self.selected_index += 1;
                }
                true
            }
            BareKey::Char('k') | BareKey::Up => {
                self.selected_index = self.selected_index.saturating_sub(1);
                true
            }

            // Selection
            BareKey::Enter => {
                self.switch_to_selected();
                false
            }

            // Quick select with numbers 1-9
            BareKey::Char(c) if c.is_ascii_digit() && c != '0' => {
                let index = (c as usize) - ('1' as usize);
                if index < self.sorted_tab_indices.len() {
                    self.selected_index = index;
                    self.switch_to_selected();
                }
                false
            }

            // Close
            BareKey::Esc | BareKey::Char('q') => {
                hide_self();
                false
            }

            _ => false,
        }
    }

    /// Switch to the currently selected session's tab
    fn switch_to_selected(&mut self) {
        if let Some(&tab_index) = self.sorted_tab_indices.get(self.selected_index) {
            if self.sessions.contains_key(&tab_index) {
                // Use tab position (1-indexed)
                switch_tab_to(tab_index as u32 + 1);
                hide_self();
            }
        }
    }

    /// Process a pipe message from OpenCode
    fn handle_pipe_message(&mut self, payload: &str) -> bool {
        let msg: OpenCodeMessage = match serde_json::from_str(payload) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[opencode-zellij] Failed to parse message: {}", e);
                return false;
            }
        };

        match msg.msg_type.as_str() {
            "init" => self.handle_init(),
            "show" => self.handle_show(),
            "hide" => self.handle_hide(),
            "toggle" => self.handle_toggle(),
            "update" => self.handle_session_update(msg),
            "end" => self.handle_session_end(msg.session_id.as_deref().unwrap_or("")),
            _ => {
                eprintln!("[opencode-zellij] Unknown message type: {}", msg.msg_type);
                false
            }
        }
    }

    /// Handle a session update message
    fn handle_session_update(&mut self, msg: OpenCodeMessage) -> bool {
        let session_id = match msg.session_id {
            Some(id) => id,
            None => {
                eprintln!("[opencode-zellij] Update message missing session_id");
                return false;
            }
        };

        // Determine which tab this update belongs to:
        // 1. If pane_id is provided, look it up in our pane_to_tab mapping
        // 2. Otherwise fall back to current_tab_index (less reliable)
        let tab_index = if let Some(pane_id_str) = &msg.pane_id {
            if let Ok(pane_id) = pane_id_str.parse::<u32>() {
                self.pane_to_tab
                    .get(&pane_id)
                    .copied()
                    .unwrap_or(self.current_tab_index)
            } else {
                // pane_id might be in format "terminal_X", try to parse X
                let numeric_part = pane_id_str
                    .strip_prefix("terminal_")
                    .and_then(|s| s.parse::<u32>().ok());
                if let Some(pane_id) = numeric_part {
                    self.pane_to_tab
                        .get(&pane_id)
                        .copied()
                        .unwrap_or(self.current_tab_index)
                } else {
                    self.current_tab_index
                }
            }
        } else {
            self.current_tab_index
        };

        let tab_name = self
            .tabs
            .get(tab_index)
            .map(|t| t.name.clone())
            .unwrap_or_else(|| format!("Tab {}", tab_index + 1));

        // Strip any existing (X/Y) suffix from tab name
        let base_name = strip_todo_suffix(&tab_name);

        let todos_done = msg.todos_done.unwrap_or(0);
        let todos_total = msg.todos_total.unwrap_or(0);
        let title = msg.title.unwrap_or_default();
        let status = msg.status.unwrap_or_else(|| "idle".to_string());

        // Update or insert session info
        let session = SessionInfo {
            tab_index,
            tab_name: base_name.clone(),
            session_id,
            title,
            todos_done,
            todos_total,
            status: status.clone(),
        };
        self.sessions.insert(tab_index, session);

        // Update sorted indices
        self.update_sorted_indices();

        // Rename the tab to show status
        // Asterisk (*) indicates busy/working, removed when idle
        let is_busy = status == "busy" || status == "retry";

        let new_name = if todos_total > 0 {
            if is_busy {
                format!("{} ({}/{}) *", base_name, todos_done, todos_total)
            } else {
                format!("{} ({}/{})", base_name, todos_done, todos_total)
            }
        } else if is_busy {
            format!("{} *", base_name)
        } else {
            // No todos and idle - restore original name
            base_name.clone()
        };

        rename_tab(tab_index as u32 + 1, &new_name);

        true
    }

    /// Handle a session end message
    fn handle_session_end(&mut self, session_id: &str) -> bool {
        // Find and remove the session by session_id
        let tab_to_remove = self
            .sessions
            .iter()
            .find(|(_, s)| s.session_id == session_id)
            .map(|(&k, _)| k);

        if let Some(tab_index) = tab_to_remove {
            if let Some(session) = self.sessions.remove(&tab_index) {
                // Restore original tab name (without todo suffix)
                rename_tab(tab_index as u32 + 1, &session.tab_name);
            }
            self.update_sorted_indices();

            // Adjust selected index if needed
            if self.selected_index >= self.sorted_tab_indices.len() {
                self.selected_index = self.sorted_tab_indices.len().saturating_sub(1);
            }
        }

        true
    }

    /// Update the sorted list of tab indices
    fn update_sorted_indices(&mut self) {
        self.sorted_tab_indices = self.sessions.keys().copied().collect();
        self.sorted_tab_indices.sort();
    }
}

impl ZellijPlugin for State {
    fn load(&mut self, _configuration: BTreeMap<String, String>) {
        request_permission(&[
            PermissionType::ReadApplicationState,
            PermissionType::ChangeApplicationState,
            PermissionType::ReadCliPipes,
        ]);
        subscribe(&[
            EventType::TabUpdate,
            EventType::PaneUpdate,
            EventType::Key,
            EventType::Visible,
            EventType::PermissionRequestResult,
        ]);

        // Don't hide yet - let user see the permission prompt first
    }

    fn update(&mut self, event: Event) -> bool {
        // Handle permission result first (always process this)
        if let Event::PermissionRequestResult(status) = &event {
            match status {
                PermissionStatus::Granted => {
                    self.has_permission_granted = true;
                    self.permission_denied = false;
                }
                PermissionStatus::Denied => {
                    self.has_permission_granted = false;
                    self.permission_denied = true;
                }
            }
            return true;
        }

        // Don't process other events until permissions are granted
        if !self.has_permission_granted {
            return false;
        }

        match event {
            Event::TabUpdate(tabs) => {
                // Find current tab
                self.current_tab_index = tabs.iter().position(|t| t.active).unwrap_or(0);
                self.tabs = tabs;

                // Update tab names in our sessions (they might have been renamed)
                for session in self.sessions.values_mut() {
                    if let Some(tab) = self.tabs.get(session.tab_index) {
                        // Only update if different and not our own rename
                        let base_name = strip_todo_suffix(&tab.name);
                        if base_name != session.tab_name
                            && !tab.name.contains(&format!(
                                "({}/{})",
                                session.todos_done, session.todos_total
                            ))
                        {
                            session.tab_name = base_name;
                        }
                    }
                }
                true
            }

            Event::PaneUpdate(pane_manifest) => {
                // Build pane_id -> tab_index mapping
                self.pane_to_tab.clear();
                for (tab_position, panes) in &pane_manifest.panes {
                    for pane in panes {
                        // Only track terminal panes (not plugins)
                        if !pane.is_plugin {
                            self.pane_to_tab.insert(pane.id, *tab_position);
                        }
                    }
                }
                self.pane_manifest = pane_manifest;
                true
            }

            Event::Key(key) => self.handle_key(key),

            Event::Visible(visible) => {
                self.visible = visible;
                if visible {
                    // Reset selection to current tab's session if it exists
                    if let Some(pos) = self
                        .sorted_tab_indices
                        .iter()
                        .position(|&i| i == self.current_tab_index)
                    {
                        self.selected_index = pos;
                    } else {
                        self.selected_index = 0;
                    }
                }
                true
            }

            _ => false,
        }
    }

    fn pipe(&mut self, pipe_message: PipeMessage) -> bool {
        // Don't process pipes until permissions are granted
        if !self.has_permission_granted {
            return false;
        }

        // Only handle messages named "opencode"
        if pipe_message.name != "opencode" {
            return false;
        }

        if let Some(payload) = pipe_message.payload {
            self.handle_pipe_message(&payload)
        } else {
            false
        }
    }

    fn render(&mut self, rows: usize, cols: usize) {
        // Show error if permissions were denied
        if self.permission_denied {
            println!();
            println!("  OpenCode Zellij Plugin");
            println!("  {}", "─".repeat(cols.min(40).saturating_sub(4)));
            println!();
            println!("  \u{1b}[31mError: Permissions Denied\u{1b}[0m");
            println!();
            println!("  This plugin requires the following permissions:");
            println!("  - ReadApplicationState");
            println!("  - ChangeApplicationState");
            println!("  - ReadCliPipes");
            println!("  - Reconfigure");
            println!();
            println!("  Please reload the plugin and grant permissions.");
            println!();
            println!("  Press Esc to close");
            return;
        }

        // Show waiting message if permissions not yet granted
        if !self.has_permission_granted {
            println!();
            println!("  OpenCode Zellij Plugin");
            println!("  {}", "─".repeat(cols.min(40).saturating_sub(4)));
            println!();
            println!("  Waiting for permissions...");
            println!("  Please grant the requested permissions.");
            return;
        }

        ui::render(self, rows, cols);
    }
}

/// Strip any existing (X/Y) todo suffix and/or trailing asterisk from a tab name
fn strip_todo_suffix(name: &str) -> String {
    let trimmed = name.trim_end();

    // First strip trailing " *" if present (busy indicator with space)
    let trimmed = trimmed.strip_suffix(" *").unwrap_or(trimmed);

    // Then strip (X/Y) pattern if present
    if let Some(paren_start) = trimmed.rfind(" (") {
        let after_paren = &trimmed[paren_start + 2..];
        if after_paren.ends_with(')') {
            let inner = &after_paren[..after_paren.len() - 1];
            // Check if it's a "X/Y" pattern
            if let Some(slash_pos) = inner.find('/') {
                let before = &inner[..slash_pos];
                let after = &inner[slash_pos + 1..];
                if before.chars().all(|c| c.is_ascii_digit())
                    && after.chars().all(|c| c.is_ascii_digit())
                {
                    return trimmed[..paren_start].to_string();
                }
            }
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_todo_suffix() {
        // Basic todo suffix stripping
        assert_eq!(strip_todo_suffix("myproject (4/5)"), "myproject");
        assert_eq!(strip_todo_suffix("myproject (0/0)"), "myproject");
        assert_eq!(strip_todo_suffix("myproject (12/34)"), "myproject");
        assert_eq!(strip_todo_suffix("myproject"), "myproject");
        assert_eq!(strip_todo_suffix("my (project)"), "my (project)");
        assert_eq!(
            strip_todo_suffix("my-project-name (1/2)"),
            "my-project-name"
        );

        // Asterisk (busy indicator) stripping - now with space before asterisk
        assert_eq!(strip_todo_suffix("myproject *"), "myproject");
        assert_eq!(strip_todo_suffix("myproject (4/5) *"), "myproject");
        assert_eq!(
            strip_todo_suffix("my-project-name (1/2) *"),
            "my-project-name"
        );

        // Edge cases
        assert_eq!(strip_todo_suffix("myproject* (1/2)"), "myproject* (1/2)"); // asterisk without space not stripped
        assert_eq!(strip_todo_suffix("my*project"), "my*project"); // asterisk in middle
        assert_eq!(strip_todo_suffix("myproject*"), "myproject*"); // asterisk without space not stripped
    }
}
