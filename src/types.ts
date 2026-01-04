export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export interface OpenCodeEvent {
  type: string;
  properties?: {
    todos?: TodoItem[];
    info?: {
      id: string;
      title?: string;
      [key: string]: unknown;
    };
    sessionID?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type SessionStatus = "idle" | "busy" | "retry";

export interface SessionState {
  sessionId: string;
  title: string;
  todosDone: number;
  todosTotal: number;
  status: SessionStatus;
}
