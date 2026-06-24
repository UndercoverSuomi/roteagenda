export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type SuggestionState = "pending" | "accepted" | "rejected";

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
  createdAt: string;
  updatedAt: string;
}

export interface RawNote {
  id: string;
  content: string;
  processed: boolean;
  createdAt: string;
}

export interface AiSuggestion {
  id: string;
  rawNoteId: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedProjectId: string | null;
  suggestedNewProjectTitle: string | null;
  confidence: number;
  priority: TaskPriority;
  dueDate: string | null;
  reasoning: string;
  needsReview: boolean;
  state: SuggestionState;
  createdAt: string;
}

export interface Tag {
  id: string;
  label: string;
  color: string;
}

export interface AppData {
  user: User;
  projects: Project[];
  tasks: Task[];
  rawNotes: RawNote[];
  suggestions: AiSuggestion[];
  tags: Tag[];
}
