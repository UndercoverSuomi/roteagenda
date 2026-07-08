import type { AiModelId } from "@/lib/ai-models";
import type { Locale } from "@/lib/i18n";

export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type SuggestionState = "pending" | "accepted" | "rejected";
export type SuggestionKind = "task" | "event";
export type GoogleSyncTarget = "calendar" | "tasks";
export type NoteSource = "manual" | "capture" | "url" | "image";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  color: string;
  progress: number;
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  sourceNoteId: string | null;
  createdBy: "user" | "ai";
  // Merkt sich eine erfolgreiche Google-Übertragung (Kalender oder Tasks).
  googleSynced: GoogleSyncTarget | null;
  createdAt: string;
  updatedAt: string;
}

// Notizen sind die Kern-Entität: Rohtext plus KI-Veredelung
// (Titel, ausformulierte Fassung, Tags, Projekt, verwandte Notizen).
export interface Note {
  id: string;
  title: string;
  content: string;
  enhanced: string;
  tags: string[];
  projectId: string | null;
  relatedNoteIds: string[];
  source: NoteSource;
  sourceUrl: string | null;
  pinned: boolean;
  processed: boolean;
  // Async-Verarbeitung durch den Notiz-Worker (Appwrite Function):
  // Storage-Datei-ID eines hochgeladenen Fotos bzw. letzte Fehlermeldung.
  pendingFileId: string | null;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiSuggestion {
  id: string;
  rawNoteId: string;
  kind: SuggestionKind;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedProjectId: string | null;
  suggestedNewProjectTitle: string | null;
  confidence: number;
  priority: TaskPriority;
  dueDate: string | null;
  // Nur bei kind="event": lokaler Zeitpunkt im Format YYYY-MM-DDTHH:MM.
  eventStart: string | null;
  eventEnd: string | null;
  reasoning: string;
  needsReview: boolean;
  state: SuggestionState;
  createdAt: string;
}

export interface UserSettings {
  aiModel: AiModelId;
  locale: Locale;
}

export interface AppData {
  user: User;
  settings: UserSettings;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  suggestions: AiSuggestion[];
}
