import type { MessageKey, Translator } from "@/lib/i18n";
import type { AiSuggestion, AppData, Project, RawNote, Task } from "@/lib/types";
import type { AiStats } from "@/components/app-types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const WELCOME_SEEN_KEY = "rote-agenda-welcome-done";

export function hasSeenWelcome() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Ohne localStorage erscheint der Startbildschirm eben erneut.
  }
}

export function collectProjectNotes(data: AppData, projectId: string): RawNote[] {
  const noteIds = new Set(
    data.tasks
      .filter((task) => task.projectId === projectId && task.sourceNoteId)
      .map((task) => task.sourceNoteId),
  );

  for (const suggestion of data.suggestions) {
    if (suggestion.suggestedProjectId === projectId) {
      noteIds.add(suggestion.rawNoteId);
    }
  }

  return data.rawNotes.filter((note) => noteIds.has(note.id));
}

export function buildAiStats(data: AppData): AiStats {
  return {
    processedNotes: data.rawNotes.filter((note) => note.processed).length,
    acceptedCount: data.suggestions.filter((item) => item.state === "accepted").length,
    pendingCount: data.suggestions.filter((item) => item.state === "pending").length,
  };
}

export function suggestionStatusKey(suggestion: AiSuggestion): MessageKey {
  if (suggestion.suggestedNewProjectTitle) return "sugg.status.newProject";
  if (suggestion.needsReview) return "sugg.status.review";
  if (suggestion.confidence < 0.75) return "sugg.status.unsure";
  return "sugg.status.confident";
}

export function projectProgress(project: Project, tasks: Task[]) {
  if (!tasks.length) return project.progress;
  const done = tasks.filter((task) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

export function readErrorMessage(error: unknown, t: Translator) {
  if (error instanceof Error && error.message) return error.message;
  return t("error.unexpected");
}
