import { Account, Client } from "appwrite";
import { NextResponse } from "next/server";
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from "@/lib/appwrite-config";
import { MAX_NOTE_LENGTH } from "@/lib/ai-models";
import {
  buildProcessingResultFromProviderText,
  callAiProvider,
  resolveAiModelConfig,
} from "@/lib/ai-server";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

type ProcessNoteRequestBody = {
  note?: unknown;
  modelId?: unknown;
  projects?: unknown;
  today?: unknown;
};

// Einfache Kostenbremse pro Nutzer und Server-Instanz.
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map<string, number[]>();

type RequestProject = Pick<
  Project,
  "id" | "title" | "description" | "keywords" | "aiEnabled"
>;

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  try {
    const jwt = readBearerToken(request.headers.get("authorization"));
    if (!jwt) {
      return jsonError("Bitte melde dich erneut an. Die KI-Anfrage braucht eine gültige Appwrite-Sitzung.", 401);
    }

    const user = await verifyAppwriteJwt(jwt);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const note = readNote(body.note);
    const modelId = readModelId(body.modelId);
    const projects = readProjects(body.projects);
    const today = readToday(body.today);
    const resolved = resolveAiModelConfig(modelId);

    if (!resolved.ok) {
      return jsonError(resolved.error, resolved.status);
    }

    const providerText = await callAiProvider({
      config: resolved.config,
      note,
      projects,
      today,
    });
    const result = buildProcessingResultFromProviderText({
      note,
      providerText,
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

function readBearerToken(value: string | null) {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function verifyAppwriteJwt(jwt: string) {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setJWT(jwt);
  const account = new Account(client);

  try {
    return await account.get();
  } catch {
    throw new RouteError(
      "Bitte melde dich erneut an. Die Appwrite-Sitzung konnte nicht geprüft werden.",
      401,
    );
  }
}

async function readJsonBody(request: Request): Promise<ProcessNoteRequestBody> {
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

function enforceRateLimit(userId: string) {
  const now = Date.now();
  const recent = (requestLog.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    throw new RouteError(
      "Zu viele KI-Anfragen in kurzer Zeit. Bitte warte ein paar Minuten und versuche es erneut.",
      429,
    );
  }

  recent.push(now);
  requestLog.set(userId, recent);
}

function readNote(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Bitte gib eine Rohnotiz ein, bevor du die KI startest.", 400);
  }

  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new RouteError(
      `Die Notiz ist zu lang (${note.length} Zeichen). Erlaubt sind maximal ${MAX_NOTE_LENGTH} Zeichen.`,
      400,
    );
  }

  return note;
}

function readToday(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return undefined;
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

    const project = {
      id: readString(item.id, "Projekt-ID"),
      title: readString(item.title, "Projekttitel"),
      description: readString(item.description, "Projektbeschreibung"),
      keywords: readStringArray(item.keywords, "Projekt-Keywords"),
      aiEnabled: typeof item.aiEnabled === "boolean" ? item.aiEnabled : true,
    };

    return project;
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
