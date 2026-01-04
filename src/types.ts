export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export interface OpenCodeEvent {
  type: string;
  todos?: TodoItem[];
  messages?: Array<{ role: string; content: string }>;
  session?: { id: string };
  [key: string]: unknown;
}

export interface SessionState {
  sessionId: string;
  title: string;
  todosDone: number;
  todosTotal: number;
}
