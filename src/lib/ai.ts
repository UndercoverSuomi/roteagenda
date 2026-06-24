import { addDays, nextWeekday, toIsoDate } from "@/lib/date";
import type { AiSuggestion, Project, TaskPriority } from "@/lib/types";

type ProjectMatch = {
  project: Project | null;
  score: number;
};

const semanticHints: Record<string, string[]> = {
  "project-marketing": [
    "angebot",
    "kunde",
    "kundin",
    "vertrieb",
    "newsletter",
    "kampagne",
    "marketing",
  ],
  "website-relaunch": ["website", "relaunch", "landingpage", "webseite", "design"],
  studium: ["studium", "uni", "prüfung", "seminar", "präsentation", "abgabe"],
  "narud-register-helper": [
    "narud",
    "register",
    "fälle",
    "fall",
    "cluster",
    "automatisch",
  ],
  "private-orga": ["privat", "janine", "flyer", "bus", "zuhause", "orga"],
};

export function processRawNote(note: string, existingProjects: Project[]) {
  const rawNoteId = createId("note");
  const createdAt = new Date().toISOString();
  const parts = splitIntoTaskLikeFragments(note);

  const suggestions = parts.map((part, index) =>
    createSuggestion(part, existingProjects, rawNoteId, createdAt, index),
  );

  return {
    rawNote: {
      id: rawNoteId,
      content: note.trim(),
      processed: true,
      createdAt,
    },
    suggestions,
  };
}

function createSuggestion(
  fragment: string,
  projects: Project[],
  rawNoteId: string,
  createdAt: string,
  index: number,
): AiSuggestion {
  const cleaned = cleanFragment(fragment);
  const match = findProject(cleaned, projects);
  const dueDate = inferDueDate(cleaned);
  const priority = inferPriority(cleaned, dueDate);
  const title = formulateTitle(cleaned);
  const confidence = calculateConfidence(cleaned, match, dueDate);
  const hasProject = Boolean(match.project);
  const needsReview = confidence < 0.65;
  const newProjectTitle = hasProject ? null : suggestProjectTitle(cleaned);

  return {
    id: createId(`suggestion-${index}`),
    rawNoteId,
    suggestedTitle: title,
    suggestedDescription: `Aus "${shorten(cleaned, 96)}" als klare Aufgabe formuliert.`,
    suggestedProjectId: match.project?.id ?? null,
    suggestedNewProjectTitle: newProjectTitle,
    confidence,
    priority,
    dueDate,
    reasoning: buildReasoning(match, dueDate, priority, needsReview, newProjectTitle),
    needsReview,
    state: "pending",
    createdAt,
  };
}

function splitIntoTaskLikeFragments(note: string) {
  const normalized = note
    .replace(/\r/g, "\n")
    .split(/\n|;|\. | und dann | außerdem | zusätzlich /i)
    .map((part) => part.trim())
    .filter(Boolean);

  return normalized.length ? normalized : [note.trim()];
}

function cleanFragment(fragment: string) {
  return fragment
    .replace(/^chef meinte,?\s*/i, "")
    .replace(/^im bus eingefallen:?\s*/i, "")
    .replace(/^idee:?\s*/i, "")
    .replace(/^vielleicht mal\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formulateTitle(cleaned: string) {
  const lower = cleaned.toLowerCase();

  if (lower.includes("angebot") && lower.includes("kunde")) {
    return "Angebot für Kunde fertigstellen";
  }

  if (lower.includes("register") && lower.includes("cluster")) {
    return "Idee zur automatischen Clusterung von Register-Fällen prüfen";
  }

  if (lower.includes("präsentation") || lower.includes("praesentation")) {
    return "Präsentation überarbeiten";
  }

  if (lower.includes("website") && lower.includes("angebot")) {
    return "Website-Angebot an Kundin schicken";
  }

  if (lower.includes("flyer") && lower.includes("janine")) {
    return "Janine wegen Flyer fragen";
  }

  const withoutDeadline = cleaned
    .replace(/\bbis\s+(heute|morgen|freitag|montag|dienstag|mittwoch|donnerstag|samstag|sonntag)\b/gi, "")
    .replace(/\bnächste woche\b/gi, "")
    .trim();

  const sentence = withoutDeadline.charAt(0).toUpperCase() + withoutDeadline.slice(1);
  return sentence.length > 6 ? sentence : "Neue Aufgabe aus Rohnotiz prüfen";
}

function findProject(text: string, projects: Project[]): ProjectMatch {
  const lower = text.toLowerCase();

  return projects.reduce<ProjectMatch>(
    (best, project) => {
      const terms = [...project.keywords, ...(semanticHints[project.id] ?? [])];
      const score = terms.reduce((total, term) => {
        return lower.includes(term.toLowerCase()) ? total + 1 : total;
      }, 0);

      return score > best.score ? { project, score } : best;
    },
    { project: null, score: 0 },
  );
}

function inferDueDate(text: string) {
  const lower = text.toLowerCase();
  const now = new Date();

  if (/\bheute\b/.test(lower)) return toIsoDate(now);
  if (/\bmorgen\b/.test(lower)) return toIsoDate(addDays(now, 1));
  if (/\bnächste woche\b|\bnaechste woche\b/.test(lower)) {
    return toIsoDate(nextWeekday(now, 1));
  }

  const weekdayMap: Record<string, number> = {
    sonntag: 0,
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
    samstag: 6,
  };

  for (const [weekday, day] of Object.entries(weekdayMap)) {
    if (lower.includes(weekday)) return toIsoDate(nextWeekday(now, day));
  }

  return null;
}

function inferPriority(text: string, dueDate: string | null): TaskPriority {
  const lower = text.toLowerCase();

  if (
    lower.includes("dringend") ||
    lower.includes("chef") ||
    lower.includes("kunde") ||
    lower.includes("bis ") ||
    (dueDate && lower.includes("fertig"))
  ) {
    return "high";
  }

  if (lower.includes("vielleicht") || lower.includes("idee")) return "medium";
  return dueDate ? "medium" : "low";
}

function calculateConfidence(text: string, match: ProjectMatch, dueDate: string | null) {
  let score = 0.48;
  if (match.project) score += Math.min(0.28, match.score * 0.07);
  if (dueDate) score += 0.08;
  if (text.length > 28) score += 0.06;
  if (/vielleicht|mal schauen|unklar/i.test(text)) score -= 0.08;

  return Number(Math.max(0.42, Math.min(0.94, score)).toFixed(2));
}

function suggestProjectTitle(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("finanz")) return "Finanzen";
  if (lower.includes("verein")) return "Vereinsarbeit";
  if (lower.includes("event")) return "Eventplanung";
  return "Neues Projekt";
}

function buildReasoning(
  match: ProjectMatch,
  dueDate: string | null,
  priority: TaskPriority,
  needsReview: boolean,
  newProjectTitle: string | null,
) {
  if (needsReview) {
    return newProjectTitle
      ? `Kein bestehendes Projekt passt sicher. Vorschlag: "${newProjectTitle}" prüfen oder selbst zuordnen.`
      : "Die Zuordnung ist nicht eindeutig genug und sollte kurz geprüft werden.";
  }

  const projectPart = match.project
    ? `Zuordnung zu "${match.project.title}" wegen passender Keywords.`
    : "Kein klares Projekt gefunden.";
  const datePart = dueDate ? "Eine Deadline wurde im Text erkannt." : "Keine Deadline erkannt.";
  const priorityPart =
    priority === "high"
      ? "Priorität hoch wegen Kund*innen-/Deadline-Signal."
      : "Priorität aus Kontext als normal eingeordnet.";

  return `${projectPart} ${datePart} ${priorityPart}`;
}

function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
