import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n";
import {
  enhanceNoteWithProvider,
  resolveAiModelConfig,
  type NoteLinkCandidate,
  type OpenTaskContext,
} from "@/lib/ai-server";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

type EnhanceNoteRequestBody = {
  noteId?: unknown;
  content?: unknown;
  modelId?: unknown;
  projects?: unknown;
  openTasks?: unknown;
  existingTags?: unknown;
  otherNotes?: unknown;
  today?: unknown;
  locale?: unknown;
};

const enforceRateLimit = createRateLimiter(10 * 60_000, 20);

// Notizen dürfen länger sein als Capture-Eingaben; Obergrenze entspricht
// dem content-Attribut in Appwrite.
const MAX_CONTENT_LENGTH = 8000;
const MAX_OPEN_TASKS = 150;
const MAX_OTHER_NOTES = 80;
const MAX_EXISTING_TAGS = 60;

type RequestProject = Pick<
  Project,
  "id" | "title" | "description" | "keywords" | "aiEnabled"
>;

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const noteId = readNoteId(body.noteId);
    const content = readContent(body.content);
    const modelId = readModelId(body.modelId);
    const projects = readProjects(body.projects);
    const openTasks = readOpenTasks(body.openTasks);
    const existingTags = readExistingTags(body.existingTags);
    const otherNotes = readOtherNotes(body.otherNotes);
    const today = readToday(body.today);
    const locale = readLocale(body.locale);
    const resolved = resolveAiModelConfig(modelId);

    if (!resolved.ok) {
      return jsonError(resolved.error, resolved.status);
    }

    const result = await enhanceNoteWithProvider({
      config: resolved.config,
      noteId,
      content,
      projects,
      openTasks,
      existingTags,
      otherNotes,
      today,
      locale,
    });

    return NextResponse.json({
      ...result,
      processedBy: {
        userId: user.$id,
        modelId: resolved.config.id,
        model: resolved.config.model,
        provider: resolved.config.provider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter KI-Fehler.";
    const status =
      error instanceof RouteError ? error.status : message.startsWith("KI-Antwort") ? 502 : 500;
    return jsonError(message, status);
  }
}

async function readJsonBody(request: Request): Promise<EnhanceNoteRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      throw new RouteError("Die KI-Anfrage ist ungültig.", 400);
    }

    return body;
  } catch {
    throw new RouteError("Die KI-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readNoteId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Die Notiz-ID fehlt in der KI-Anfrage.", 400);
  }

  return value.trim();
}

function readContent(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Bitte gib eine Notiz ein, bevor du die KI startest.", 400);
  }

  const content = value.trim();
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new RouteError(
      `Die Notiz ist zu lang (${content.length} Zeichen). Erlaubt sind maximal ${MAX_CONTENT_LENGTH} Zeichen.`,
      400,
    );
  }

  return content;
}

function readToday(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return undefined;
}

function readLocale(value: unknown) {
  return typeof value === "string" && isLocale(value) ? value : "de";
}

function readModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Bitte wähle in den Einstellungen ein KI-Modell aus.", 400);
  }

  return value.trim();
}

function readProjects(value: unknown): RequestProject[] {
  if (!Array.isArray(value)) {
    throw new RouteError("Die Projektliste für die KI-Anfrage ist ungültig.", 400);
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new RouteError("Die Projektliste enthält einen ungültigen Eintrag.", 400);
    }

    return {
      id: readString(item.id, "Projekt-ID"),
      title: readString(item.title, "Projekttitel"),
      description: readString(item.description, "Projektbeschreibung"),
      keywords: readStringArray(item.keywords, "Projekt-Keywords"),
      aiEnabled: typeof item.aiEnabled === "boolean" ? item.aiEnabled : true,
    };
  });
}

// Optionaler Kontext: offene Aufgaben zur Duplikat-Vermeidung.
function readOpenTasks(value: unknown): OpenTaskContext[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new RouteError("Die Aufgabenliste für die KI-Anfrage ist ungültig.", 400);
  }

  return value.slice(0, MAX_OPEN_TASKS).flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== "string" || !item.title.trim()) {
      return [];
    }

    return [
      {
        title: item.title,
        projectId: typeof item.projectId === "string" ? item.projectId : null,
        dueDate:
          typeof item.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)
            ? item.dueDate
            : null,
      },
    ];
  });
}

function readExistingTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];

  return value
    .filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
    .slice(0, MAX_EXISTING_TAGS);
}

// Kandidaten für die Verlinkung mit anderen Notizen.
function readOtherNotes(value: unknown): NoteLinkCandidate[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_OTHER_NOTES).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
      return [];
    }

    return [
      {
        id: item.id,
        title: typeof item.title === "string" ? item.title : "",
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
      },
    ];
  });
}

function readString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new RouteError(`${label} ist ungültig.`, 400);
  }

  return value;
}

function readStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RouteError(`${label} sind ungültig.`, 400);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}
