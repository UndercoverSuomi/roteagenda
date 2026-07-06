import { getAiModelLabel, isAiModelId, type AiModelId } from "./ai-models.ts";
import type { AiSuggestion, Project, RawNote, TaskPriority } from "./types.ts";

type AiProviderKind = "openai-responses" | "chat-completions";
type Env = Record<string, string | undefined>;

type AiProviderDefinition = {
  provider: AiProviderKind;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  openRouterModelEnv: string;
  defaultOpenRouterModel: string;
};

export const OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY";
const OPENROUTER_BASE_URL_ENV = "OPENROUTER_BASE_URL";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type ResolvedAiModelConfig = {
  id: AiModelId;
  label: string;
  provider: AiProviderKind;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type AiProcessingResult = {
  rawNote: RawNote;
  suggestions: AiSuggestion[];
};

type BuildProcessingResultParams = {
  note: string;
  providerText: string;
  nowIso?: string;
  idFactory?: (prefix: string) => string;
};

type CallAiProviderParams = {
  config: ResolvedAiModelConfig;
  note: string;
  projects: Pick<Project, "id" | "title" | "description" | "keywords" | "aiEnabled">[];
  today?: string;
  fetchFn?: typeof fetch;
};

type ResolveResult =
  | { ok: true; config: ResolvedAiModelConfig }
  | { ok: false; error: string; status: number };

const PROVIDER_DEFINITIONS: Record<AiModelId, AiProviderDefinition> = {
  "openai-gpt-5-5": {
    provider: "openai-responses",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_GPT_5_5_MODEL",
    defaultModel: "gpt-5.5",
    openRouterModelEnv: "OPENROUTER_GPT_5_5_MODEL",
    defaultOpenRouterModel: "openai/gpt-5.5",
  },
  "glm-5-2": {
    provider: "chat-completions",
    keyEnv: "ZAI_API_KEY",
    modelEnv: "ZAI_GLM_5_2_MODEL",
    defaultModel: "glm-5.2",
    baseUrlEnv: "ZAI_BASE_URL",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    openRouterModelEnv: "OPENROUTER_GLM_5_2_MODEL",
    defaultOpenRouterModel: "z-ai/glm-5.2",
  },
  "kimi-k2-7": {
    provider: "chat-completions",
    keyEnv: "MOONSHOT_API_KEY",
    modelEnv: "MOONSHOT_KIMI_K2_7_MODEL",
    defaultModel: "kimi-k2.7",
    baseUrlEnv: "MOONSHOT_BASE_URL",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    openRouterModelEnv: "OPENROUTER_KIMI_K2_7_MODEL",
    defaultOpenRouterModel: "moonshotai/kimi-k2.7",
  },
  "qwen-3-7-plus": {
    provider: "chat-completions",
    keyEnv: "DASHSCOPE_API_KEY",
    modelEnv: "DASHSCOPE_QWEN_3_7_PLUS_MODEL",
    defaultModel: "qwen3.7-plus",
    baseUrlEnv: "DASHSCOPE_BASE_URL",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openRouterModelEnv: "OPENROUTER_QWEN_3_7_PLUS_MODEL",
    defaultOpenRouterModel: "qwen/qwen3.7-plus",
  },
  "qwen-3-7-max": {
    provider: "chat-completions",
    keyEnv: "DASHSCOPE_API_KEY",
    modelEnv: "DASHSCOPE_QWEN_3_7_MAX_MODEL",
    defaultModel: "qwen3.7-max",
    baseUrlEnv: "DASHSCOPE_BASE_URL",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openRouterModelEnv: "OPENROUTER_QWEN_3_7_MAX_MODEL",
    defaultOpenRouterModel: "qwen/qwen3.7-max",
  },
  "minimax-m3": {
    provider: "chat-completions",
    keyEnv: "MINIMAX_API_KEY",
    modelEnv: "MINIMAX_M3_MODEL",
    defaultModel: "MiniMax-M3",
    baseUrlEnv: "MINIMAX_BASE_URL",
    defaultBaseUrl: "https://api.minimax.io/v1",
    openRouterModelEnv: "OPENROUTER_MINIMAX_M3_MODEL",
    defaultOpenRouterModel: "minimax/minimax-m3",
  },
  "deepseek-v4-pro": {
    provider: "chat-completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_V4_PRO_MODEL",
    defaultModel: "deepseek-v4-pro",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    openRouterModelEnv: "OPENROUTER_DEEPSEEK_V4_PRO_MODEL",
    defaultOpenRouterModel: "deepseek/deepseek-v4-pro",
  },
  "deepseek-v4-flash": {
    provider: "chat-completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_V4_FLASH_MODEL",
    defaultModel: "deepseek-v4-flash",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    openRouterModelEnv: "OPENROUTER_DEEPSEEK_V4_FLASH_MODEL",
    defaultOpenRouterModel: "deepseek/deepseek-v4-flash",
  },
};

export function resolveAiModelConfig(modelId: string, env: Env = process.env): ResolveResult {
  if (!isAiModelId(modelId)) {
    return {
      ok: false,
      status: 400,
      error: `Das ausgewählte KI-Modell "${modelId}" wird von Rote Agenda nicht unterstützt.`,
    };
  }

  const definition = PROVIDER_DEFINITIONS[modelId];
  const label = getAiModelLabel(modelId);
  const directKey = env[definition.keyEnv]?.trim();

  // Direkter Anbieter-Key hat Vorrang; sonst laufen alle Modelle über OpenRouter.
  if (directKey) {
    const baseUrl = definition.baseUrlEnv
      ? env[definition.baseUrlEnv]?.trim() || definition.defaultBaseUrl
      : undefined;

    return {
      ok: true,
      config: {
        id: modelId,
        label,
        provider: definition.provider,
        apiKey: directKey,
        model: env[definition.modelEnv]?.trim() || definition.defaultModel,
        baseUrl,
      },
    };
  }

  const openRouterKey = env[OPENROUTER_KEY_ENV]?.trim();

  if (openRouterKey) {
    return {
      ok: true,
      config: {
        id: modelId,
        label,
        provider: "chat-completions",
        apiKey: openRouterKey,
        model:
          env[definition.openRouterModelEnv]?.trim() ||
          definition.defaultOpenRouterModel,
        baseUrl: env[OPENROUTER_BASE_URL_ENV]?.trim() || DEFAULT_OPENROUTER_BASE_URL,
      },
    };
  }

  return {
    ok: false,
    status: 503,
    error: `${label} ist nicht konfiguriert. Setze entweder ${OPENROUTER_KEY_ENV} (ein Key für alle Modelle) oder ${definition.keyEnv} (direkter Anbieter) in Appwrite/Next.`,
  };
}

export function parseProviderJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("KI-Antwort konnte nicht als JSON gelesen werden.");
  }
}

export function extractProviderText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("KI-Anbieter hat keine gültige Antwort zurückgegeben.");
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const responseText = extractResponsesText(payload);
  if (responseText) return responseText;

  const chatText = extractChatCompletionsText(payload);
  if (chatText) return chatText;

  throw new Error("KI-Anbieter hat keinen Textinhalt zurückgegeben.");
}

export async function callAiProvider({
  config,
  note,
  projects,
  today,
  fetchFn = fetch,
}: CallAiProviderParams): Promise<string> {
  const prompt = buildPrompt(note, projects, today);
  const response =
    config.provider === "openai-responses"
      ? await callOpenAiResponses(config, prompt, fetchFn)
      : await callChatCompletions(config, prompt, fetchFn);

  const payload = await readJsonResponse(response, config.label);
  return extractProviderText(payload);
}

export function buildProcessingResultFromProviderText({
  note,
  providerText,
  nowIso = new Date().toISOString(),
  idFactory = createId,
}: BuildProcessingResultParams): AiProcessingResult {
  const payload = parseProviderJson(providerText);
  const suggestionsPayload = readSuggestionsPayload(payload);
  const rawNoteId = idFactory("note");

  return {
    rawNote: {
      id: rawNoteId,
      content: note.trim(),
      processed: true,
      createdAt: nowIso,
    },
    suggestions: suggestionsPayload.map((suggestion, index) =>
      normalizeSuggestion(suggestion, rawNoteId, nowIso, idFactory(`suggestion-${index}`)),
    ),
  };
}

function readSuggestionsPayload(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.suggestions)) {
    throw new Error("KI-Antwort enthält keine gültige suggestions-Liste.");
  }

  if (payload.suggestions.length === 0) {
    throw new Error("KI-Antwort enthält keine Vorschläge.");
  }

  return payload.suggestions.map((item) => {
    if (!isRecord(item)) {
      throw new Error("KI-Antwort enthält einen ungültigen Vorschlag.");
    }

    return item;
  });
}

function normalizeSuggestion(
  value: Record<string, unknown>,
  rawNoteId: string,
  createdAt: string,
  id: string,
): AiSuggestion {
  const priority = readPriority(value.priority);
  const confidence = readConfidence(value.confidence);

  return {
    id,
    rawNoteId,
    suggestedTitle: readRequiredString(value.suggestedTitle, "suggestedTitle"),
    suggestedDescription: readRequiredString(
      value.suggestedDescription,
      "suggestedDescription",
    ),
    suggestedProjectId: readNullableString(value.suggestedProjectId, "suggestedProjectId"),
    suggestedNewProjectTitle: readNullableString(
      value.suggestedNewProjectTitle,
      "suggestedNewProjectTitle",
    ),
    confidence,
    priority,
    dueDate: readNullableDate(value.dueDate),
    reasoning: readRequiredString(value.reasoning, "reasoning"),
    needsReview: readBoolean(value.needsReview, "needsReview"),
    state: "pending",
    createdAt,
  };
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`KI-Antwort enthält kein gültiges Feld "${field}".`);
  }

  return value.trim();
}

function readNullableString(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`KI-Antwort enthält kein gültiges Feld "${field}".`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNullableDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('KI-Antwort enthält kein gültiges Feld "dueDate".');
  }

  return value;
}

function readBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`KI-Antwort enthält kein gültiges Feld "${field}".`);
  }

  return value;
}

function readPriority(value: unknown): TaskPriority {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error('KI-Antwort enthält kein gültiges Feld "priority".');
}

function readConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error('KI-Antwort enthält kein gültiges Feld "confidence".');
  }

  return Number(value.toFixed(2));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const GERMAN_WEEKDAYS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

function describeToday(todayIso?: string) {
  const iso =
    todayIso && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
      ? todayIso
      : new Date().toISOString().slice(0, 10);
  const weekday = GERMAN_WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

  return `${weekday}, ${iso}`;
}

function buildPrompt(
  note: string,
  projects: Pick<Project, "id" | "title" | "description" | "keywords" | "aiEnabled">[],
  today?: string,
) {
  const enabledProjects = projects
    .filter((project) => project.aiEnabled)
    .map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description,
      keywords: project.keywords,
    }));

  return [
    "Du bist die strukturierende KI von Rote Agenda.",
    `Heute ist ${describeToday(today)}.`,
    "Wandle die Rohnotiz in 1 bis 4 konkrete Aufgabenvorschläge um.",
    "Antworte ausschließlich mit gültigem JSON in dieser Form:",
    '{"suggestions":[{"suggestedTitle":"...","suggestedDescription":"...","suggestedProjectId":"project-id oder null","suggestedNewProjectTitle":"Name oder null","confidence":0.0,"priority":"low|medium|high","dueDate":"YYYY-MM-DD oder null","reasoning":"kurze Begründung","needsReview":true}]}',
    "Nutze suggestedProjectId nur, wenn eines der aktivierten Projekte klar passt.",
    "Wenn kein Projekt passt, setze suggestedProjectId auf null und suggestedNewProjectTitle auf einen kurzen Projektnamen.",
    "Rechne relative Angaben wie heute, morgen, Freitag oder nächste Woche vom heutigen Datum aus in ein konkretes dueDate um.",
    "Setze dueDate auf null, wenn keine Deadline erkennbar ist.",
    "Aktivierte Projekte:",
    JSON.stringify(enabledProjects),
    "Rohnotiz:",
    note,
  ].join("\n");
}

async function callOpenAiResponses(
  config: ResolvedAiModelConfig,
  prompt: string,
  fetchFn: typeof fetch,
) {
  return fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: providerHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_output_tokens: 1800,
    }),
  });
}

async function callChatCompletions(
  config: ResolvedAiModelConfig,
  prompt: string,
  fetchFn: typeof fetch,
) {
  if (!config.baseUrl) {
    throw new Error(`${config.label} ist ohne Base URL konfiguriert.`);
  }

  return fetchFn(joinUrl(config.baseUrl, "chat/completions"), {
    method: "POST",
    headers: providerHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content:
            "Du extrahierst Aufgaben aus Rohnotizen und antwortest ausschließlich mit JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1800,
    }),
  });
}

function providerHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readJsonResponse(response: Response, providerLabel: string) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${providerLabel} konnte nicht antworten (${response.status}): ${readProviderError(text)}`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${providerLabel} hat keine gültige JSON-HTTP-Antwort geliefert.`);
  }
}

function readProviderError(text: string) {
  if (!text.trim()) return "Keine Details vom Anbieter erhalten.";

  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload)) {
      if (isRecord(payload.error) && typeof payload.error.message === "string") {
        return payload.error.message;
      }

      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
  } catch {
    return text.slice(0, 220);
  }

  return text.slice(0, 220);
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function extractResponsesText(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.output)) return null;

  const parts = payload.output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return [];

    return item.content.flatMap((contentItem) => {
      if (!isRecord(contentItem)) return [];
      if (typeof contentItem.text === "string") return [contentItem.text];
      return [];
    });
  });

  const text = parts.join("").trim();
  return text || null;
}

function extractChatCompletionsText(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.choices)) return null;

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;

  const content = firstChoice.message.content;
  if (typeof content === "string") return content.trim() || null;

  if (!Array.isArray(content)) return null;

  const text = content
    .flatMap((part) => {
      if (!isRecord(part)) return [];
      if (typeof part.text === "string") return [part.text];
      return [];
    })
    .join("")
    .trim();

  return text || null;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
