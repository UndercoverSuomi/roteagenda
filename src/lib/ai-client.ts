import { account } from "@/lib/appwrite";
import type { AiModelId } from "@/lib/ai-models";
import type { AiProcessingResult, BriefingTask, OpenTaskContext } from "@/lib/ai-server";
import { toIsoDate } from "@/lib/date";
import type { Locale } from "@/lib/i18n";
import type { Project } from "@/lib/types";

type ProcessNoteRequest = {
  note: string;
  modelId: AiModelId;
  projects: Project[];
  openTasks: OpenTaskContext[];
  locale: Locale;
};

type ErrorResponse = {
  error?: string;
};

async function authorizedJsonPost<T>(
  path: string,
  body: Record<string, unknown>,
  fallbackError: (status: number) => string,
): Promise<T & ErrorResponse> {
  const jwt = await account.createJWT({ duration: 900 });
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as (T & ErrorResponse) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackError(response.status));
  }

  if (!payload) {
    throw new Error(fallbackError(response.status));
  }

  return payload;
}

export async function processRawNoteWithConfiguredAi({
  note,
  modelId,
  projects,
  openTasks,
  locale,
}: ProcessNoteRequest): Promise<AiProcessingResult> {
  const payload = await authorizedJsonPost<AiProcessingResult>(
    "/api/ai/process-note",
    {
      note,
      modelId,
      projects,
      openTasks,
      today: toIsoDate(new Date()),
      locale,
    },
    (status) =>
      `Die KI-Anfrage ist fehlgeschlagen (${status}). Bitte prüfe die Konfiguration.`,
  );

  if (!payload.rawNote || !Array.isArray(payload.suggestions)) {
    throw new Error("Die KI-Antwort hatte nicht das erwartete Format.");
  }

  return {
    rawNote: payload.rawNote,
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
