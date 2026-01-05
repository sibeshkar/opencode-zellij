use crate::{SessionInfo, State};

/// Render the session chooser UI
pub fn render(state: &State, rows: usize, cols: usize) {
    if state.sessions.is_empty() {
        render_empty(rows, cols);
        return;
    }

    render_session_list(state, rows, cols);
}

/// Render an empty state message
fn render_empty(_rows: usize, cols: usize) {
    let title = "OpenCode Sessions";
    let separator = "─".repeat(cols.min(40).saturating_sub(2));
    let message = "No active OpenCode sessions";
    let hint = "Press Esc to close";

    println!();
    println!("  {}", title);
    println!("  {}", separator);
    println!();
    println!("  {}", message);
    println!();
    println!("  {}", hint);
}

/// Render the list of sessions
fn render_session_list(state: &State, rows: usize, cols: usize) {
    let title = "OpenCode Sessions";
    let separator = "─".repeat(cols.min(40).saturating_sub(2));

    println!();
    println!("  {}", title);
    println!("  {}", separator);
    println!();

    // Calculate how many sessions we can show
    // Reserve lines for: empty line, title, separator, empty line, hints (2 lines), empty line
    let available_rows = rows.saturating_sub(8);
    // Each session takes 2 lines (name + title/todos)
    let max_sessions = available_rows / 2;

    // Build the list items
    let sessions: Vec<_> = state
        .sorted_tab_indices
        .iter()
        .filter_map(|&idx| state.sessions.get(&idx))
        .take(max_sessions)
        .collect();

    for (i, session) in sessions.iter().enumerate() {
        let is_selected = i == state.selected_index;
        let is_current = session.tab_index == state.current_tab_index;

        render_session_item(session, i, is_selected, is_current, cols);
    }

    // Show hints at the bottom
    println!();
    let hints = "j/k: navigate  Enter: switch  c: clear  D: clear all  Esc: close";
    println!("  {}", truncate(hints, cols.saturating_sub(4)));
}

/// Render a single session item
fn render_session_item(
    session: &SessionInfo,
    index: usize,
    is_selected: bool,
    is_current: bool,
    cols: usize,
) {
    let number = index + 1;
    let current_marker = if is_current { " *" } else { "" };
    let selector = if is_selected { ">" } else { " " };

    // Status indicator with colors: busy = green, idle = yellow
    let status_str = if session.status == "busy" || session.status == "retry" {
        "\u{1b}[32m(busy)\u{1b}[0m" // Green
    } else {
        "\u{1b}[33m(idle)\u{1b}[0m" // Yellow
    };

    // First line: [N] tab-name (status) *
    let tab_line = format!(
        "{} [{}] {} {}{}",
        selector, number, session.tab_name, status_str, current_marker
    );

    // Second line: "title" (done/total)
    let todo_str = if session.todos_total > 0 {
        format!("({}/{})", session.todos_done, session.todos_total)
    } else {
        String::new()
    };

    let title_display = if session.title.is_empty() {
        "(no title)".to_string()
    } else {
        format!("\"{}\"", truncate(&session.title, 25))
    };

    let title_line = format!("     {} {}", title_display, todo_str);

    // Apply styling
    if is_selected {
        // Bold/highlighted for selected
        println!(
            "\u{1b}[1m{}\u{1b}[0m",
            truncate(&tab_line, cols.saturating_sub(2))
        );
        println!(
            "\u{1b}[1m{}\u{1b}[0m",
            truncate(&title_line, cols.saturating_sub(2))
        );
    } else {
        println!("  {}", truncate(&tab_line, cols.saturating_sub(4)));
        println!("  {}", truncate(&title_line, cols.saturating_sub(4)));
    }
}

/// Truncate a string to a maximum length, adding "..." if truncated
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else if max_len <= 3 {
        ".".repeat(max_len)
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
