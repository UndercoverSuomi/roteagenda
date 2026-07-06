import { account } from "@/lib/appwrite";
import type { AiModelId } from "@/lib/ai-models";
import type { AiProcessingResult } from "@/lib/ai-server";
import { toIsoDate } from "@/lib/date";
import type { Project } from "@/lib/types";

type ProcessNoteRequest = {
  note: string;
  modelId: AiModelId;
  projects: Project[];
};

type ErrorResponse = {
  error?: string;
};

export async function processRawNoteWithConfiguredAi({
  note,
  modelId,
  projects,
}: ProcessNoteRequest): Promise<AiProcessingResult> {
  const jwt = await account.createJWT({ duration: 900 });
  const response = await fetch("/api/ai/process-note", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      note,
      modelId,
      projects,
      today: toIsoDate(new Date()),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (AiProcessingResult & ErrorResponse)
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error ??
        `Die KI-Anfrage ist fehlgeschlagen (${response.status}). Bitte prüfe die Konfiguration.`,
    );
  }

  if (!payload?.rawNote || !Array.isArray(payload.suggestions)) {
    throw new Error("Die KI-Antwort hatte nicht das erwartete Format.");
  }

  return {
    rawNote: payload.rawNote,
    suggestions: payload.suggestions,
  };
}
