import type { UrlScreen } from "@/lib/app-url";
import type { MessageKey } from "@/lib/i18n";
import type { TaskPriority, TaskStatus } from "@/lib/types";

// Alle URL-adressierbaren Screens plus der einmalige Startbildschirm.
export type Screen = UrlScreen | "welcome";
export type TaskFilter = "all" | "today" | "planned" | "later";
export type ProjectDetailTab = "tasks" | "details" | "notes";
export type TaskDetailTab = "details" | "raw" | "ai";
export type AuthMode = "login" | "register" | "recover";
export type AuthStatus = "loading" | "signedOut" | "signedIn";
export type DataStatus = "idle" | "loading" | "ready" | "error";

export type AiStats = {
  processedNotes: number;
  acceptedCount: number;
  pendingCount: number;
};

export const priorityKeys: Record<TaskPriority, MessageKey> = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high",
};

export const statusKeys: Record<TaskStatus, MessageKey> = {
  open: "status.open",
  in_progress: "status.in_progress",
  done: "status.done",
};
