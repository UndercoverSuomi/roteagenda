import { addDays, fixedToday, nextWeekday, toIsoDate } from "@/lib/date";
import { DEFAULT_AI_MODEL_ID } from "@/lib/ai-models";
import type { AppData, Project, Task } from "@/lib/types";

const seedNow = "2026-06-24T09:41:00.000Z";
const today = fixedToday();

export const initialProjects: Project[] = [
  {
    id: "project-marketing",
    title: "Projekt Marketing",
    description:
      "Kampagnen, Angebote, Newsletter und Abstimmungen mit Kund*innen.",
    keywords: ["marketing", "angebot", "kunde", "kundin", "newsletter", "vertrieb"],
    progress: 60,
    aiEnabled: true,
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "website-relaunch",
    title: "Website Relaunch",
    description:
      "Neue Seitenstruktur, Landingpages, Inhalte und visuelle Überarbeitung.",
    keywords: ["website", "relaunch", "landingpage", "design", "vorlage"],
    progress: 38,
    aiEnabled: true,
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "studium",
    title: "Studium",
    description:
      "Präsentationen, Seminare, Abgaben und Lernorganisation bündeln.",
    keywords: ["studium", "seminar", "prüfung", "präsentation", "lernen"],
    progress: 46,
    aiEnabled: true,
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "narud-register-helper",
    title: "NARUD Register Helper",
    description:
      "Register-Fälle strukturieren, clustern und technische Ideen prüfen.",
    keywords: ["narud", "register", "fälle", "cluster", "automatisch", "ki"],
    progress: 28,
    aiEnabled: true,
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "private-orga",
    title: "Private Orga",
    description: "Private Absprachen, kleine Besorgungen und lose Erinnerungen.",
    keywords: ["privat", "janine", "flyer", "orga", "bus", "zuhause"],
    progress: 24,
    aiEnabled: false,
    createdAt: seedNow,
    updatedAt: seedNow,
  },
];

export const initialTasks: Task[] = [
  {
    id: "task-design-update",
    title: "Projekt-Update für Design vorbereiten",
    description:
      "Aktuellen Stand zusammenfassen und offene Entscheidungen markieren.",
    projectId: "project-marketing",
    status: "open",
    priority: "medium",
    dueDate: toIsoDate(today),
    sourceNoteId: null,
    createdBy: "user",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "task-angebot",
    title: "Angebot für Kunde vorbereiten",
    description: "Leistungsübersicht, Preisoptionen und nächste Schritte bündeln.",
    projectId: "project-marketing",
    status: "in_progress",
    priority: "high",
    dueDate: toIsoDate(today),
    sourceNoteId: null,
    createdBy: "ai",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "task-landingpage",
    title: "Landingpage überarbeiten",
    description:
      "Hero, Leistungsabschnitt und Kontaktpfad für den Relaunch glätten.",
    projectId: "website-relaunch",
    status: "open",
    priority: "medium",
    dueDate: toIsoDate(addDays(today, 1)),
    sourceNoteId: null,
    createdBy: "user",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "task-newsletter",
    title: "Newsletter planen",
    description: "Themen, Zielgruppe und Versandfenster festlegen.",
    projectId: "project-marketing",
    status: "open",
    priority: "low",
    dueDate: toIsoDate(nextWeekday(today, 5)),
    sourceNoteId: null,
    createdBy: "user",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "task-meeting",
    title: "Meeting mit Marketing planen",
    description: "Agenda vorbereiten und Termin mit dem Team abstimmen.",
    projectId: "project-marketing",
    status: "open",
    priority: "medium",
    dueDate: toIsoDate(nextWeekday(addDays(today, 2), 5)),
    sourceNoteId: null,
    createdBy: "user",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
  {
    id: "task-register-cluster",
    title: "Idee zur automatischen Clusterung prüfen",
    description:
      "Machbarkeit für Register-Fälle skizzieren und offene Datenfragen sammeln.",
    projectId: "narud-register-helper",
    status: "open",
    priority: "medium",
    dueDate: null,
    sourceNoteId: null,
    createdBy: "ai",
    createdAt: seedNow,
    updatedAt: seedNow,
  },
];

export function createInitialData(): AppData {
  return {
    user: {
      id: "user-1",
      name: "Mara",
      email: "mara@example.org",
    },
    settings: {
      aiModel: DEFAULT_AI_MODEL_ID,
    },
    projects: initialProjects,
    tasks: initialTasks,
    rawNotes: [
      {
        id: "note-1",
        content:
          "Chef meinte ich soll bis Freitag nochmal das Angebot für den Kunden fertig machen.",
        processed: true,
        createdAt: seedNow,
      },
    ],
    suggestions: [
      {
        id: "suggestion-1",
        rawNoteId: "note-1",
        suggestedTitle: "Angebot für Kunde fertigstellen",
        suggestedDescription:
          "Aus der Rohnotiz wurde eine konkrete Aufgabe für das Marketing-Projekt.",
        suggestedProjectId: "project-marketing",
        suggestedNewProjectTitle: null,
        confidence: 0.86,
        priority: "high",
        dueDate: toIsoDate(nextWeekday(today, 5)),
        reasoning:
          "Wörter wie Angebot, Kunde und Freitag passen stark zu Projekt Marketing und einer nahen Deadline.",
        needsReview: false,
        state: "accepted",
        createdAt: seedNow,
      },
    ],
    tags: [
      { id: "tag-ai", label: "KI", color: "#d84b3f" },
      { id: "tag-client", label: "Kundin", color: "#0c261f" },
      { id: "tag-focus", label: "Fokus", color: "#b93630" },
    ],
  };
}
