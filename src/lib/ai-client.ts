import { account } from "@/lib/appwrite";
import type { AiModelId } from "@/lib/ai-models";
import type {
  BriefingTask,
  GraphInsightNode,
  GraphInsights,
  NoteEnhancementResult,
  NoteLinkCandidate,
  OpenTaskContext,
} from "@/lib/ai-server";
import { toIsoDate } from "@/lib/date";
import type { Locale } from "@/lib/i18n";
import type { Project } from "@/lib/types";

type EnhanceNoteRequest = {
  noteId: string;
  content: string;
  modelId: AiModelId;
  projects: Project[];
  openTasks: OpenTaskContext[];
  existingTags: string[];
  otherNotes: NoteLinkCandidate[];
  locale: Locale;
};

type ErrorResponse = {
  error?: string;
};

// Ein JWT pro Sitzung wiederverwenden statt eines pro Aufruf:
// createJWT ist ein eigener Appwrite-Roundtrip (rate-limitiert) und
// machte jeden KI-Aufruf langsamer und fehleranfälliger als nötig.
const JWT_DURATION_SECONDS = 900;
let cachedJwt: { value: string; expiresAt: number } | null = null;

async function getJwt(forceFresh = false): Promise<string> {
  const now = Date.now();
  if (!forceFresh && cachedJwt && cachedJwt.expiresAt > now) {
    return cachedJwt.value;
  }

  const created = await account.createJWT({ duration: JWT_DURATION_SECONDS });
  // 60 s Puffer, damit ein Request nicht mit einem auslaufenden Token startet.
  cachedJwt = {
    value: created.jwt,
    expiresAt: now + (JWT_DURATION_SECONDS - 60) * 1000,
  };
  return created.jwt;
}

async function authorizedJsonPost<T>(
  path: string,
  body: Record<string, unknown>,
  fallbackError: (status: number) => string,
): Promise<T & ErrorResponse> {
  const post = (jwt: string) =>
    fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

  let response = await post(await getJwt());
  if (response.status === 401) {
    // Gecachtes JWT kann nach Logout/Login oder Session-Ende tot sein —
    // einmal mit frischem Token wiederholen, erst dann aufgeben.
    response = await post(await getJwt(true));
  }

  const payload = (await response.json().catch(() => null)) as (T & ErrorResponse) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackError(response.status));
  }

  if (!payload) {
    throw new Error(fallbackError(response.status));
  }

  return payload;
}

export async function enhanceNoteWithConfiguredAi({
  noteId,
  content,
  modelId,
  projects,
  openTasks,
  existingTags,
  otherNotes,
  locale,
}: EnhanceNoteRequest): Promise<NoteEnhancementResult> {
  const payload = await authorizedJsonPost<NoteEnhancementResult>(
    "/api/ai/enhance-note",
    {
      noteId,
      content,
      modelId,
      projects,
      openTasks,
      existingTags,
      otherNotes,
      today: toIsoDate(new Date()),
      locale,
    },
    (status) =>
      `Die KI-Anfrage ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (!payload.enhancement || !Array.isArray(payload.suggestions)) {
    throw new Error("Die KI-Antwort hatte nicht das erwartete Format.");
  }

  return {
    enhancement: payload.enhancement,
    suggestions: payload.suggestions,
  };
}

export async function transcribeVoiceNote({
  audioBase64,
  locale,
}: {
  audioBase64: string;
  locale: Locale;
}): Promise<string> {
  const payload = await authorizedJsonPost<{ text?: string }>(
    "/api/ai/transcribe",
    {
      audio: audioBase64,
      format: "wav",
      locale,
    },
    (status) =>
      `Die Transkription ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (!payload.text) {
    throw new Error("Die Transkription hat keinen Text geliefert.");
  }

  return payload.text;
}

export async function extractPhotoText({
  imageBase64,
  locale,
}: {
  imageBase64: string;
  locale: Locale;
}): Promise<string> {
  const payload = await authorizedJsonPost<{ text?: string }>(
    "/api/ai/extract-image",
    {
      image: imageBase64,
      locale,
    },
    (status) =>
      `Die Foto-Erkennung ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (!payload.text) {
    throw new Error("Auf dem Foto wurde kein Text erkannt.");
  }

  return payload.text;
}

export async function fetchGraphInsights({
  modelId,
  locale,
  nodes,
  edges,
}: {
  modelId: AiModelId;
  locale: Locale;
  nodes: GraphInsightNode[];
  edges: Array<[number, number]>;
}): Promise<GraphInsights> {
  const payload = await authorizedJsonPost<GraphInsights>(
    "/api/ai/graph-insights",
    { modelId, locale, nodes, edges },
    (status) =>
      `Die Netz-Analyse ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (typeof payload.summary !== "string" || !payload.summary.trim()) {
    throw new Error("Die Netz-Analyse hat kein Ergebnis geliefert.");
  }

  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

  return {
    summary: payload.summary,
    clusters: list(payload.clusters),
    anomalies: list(payload.anomalies),
    gaps: list(payload.gaps),
    suggestions: list(payload.suggestions),
  };
}

export async function fetchDailyBriefing({
  modelId,
  tasks,
  locale,
}: {
  modelId: AiModelId;
  tasks: BriefingTask[];
  locale: Locale;
}): Promise<string> {
  const payload = await authorizedJsonPost<{ text?: string }>(
    "/api/ai/daily-briefing",
    {
      modelId,
      tasks,
      today: toIsoDate(new Date()),
      locale,
    },
    (status) =>
      `Das Tagesbriefing ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (!payload.text) {
    throw new Error("Das Tagesbriefing hat keinen Text geliefert.");
  }

  return payload.text;
}
