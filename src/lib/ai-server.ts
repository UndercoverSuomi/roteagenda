import { getAiModelLabel, isAiModelId, type AiModelId } from "./ai-models.ts";
import type { Locale } from "./i18n.ts";
import type { AiSuggestion, Project, SuggestionKind, TaskPriority } from "./types.ts";

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

// Ergebnis der Notiz-Veredelung: Anreicherung der Notiz selbst plus
// erkannte Aufgaben-/Terminvorschläge.
export type NoteEnhancement = {
  title: string;
  enhanced: string;
  tags: string[];
  projectId: string | null;
  relatedNoteIds: string[];
};

export type NoteEnhancementResult = {
  enhancement: NoteEnhancement;
  suggestions: AiSuggestion[];
};

// Kontext über bereits vorhandene offene Aufgaben, damit die KI keine
// Duplikate vorschlägt.
export type OpenTaskContext = {
  title: string;
  projectId: string | null;
  dueDate: string | null;
};

// Kandidaten für die Notiz-Verlinkung. Der Snippet gibt der KI genug
// Inhalt, um thematische Bezüge zu erkennen — Titel und Tags allein
// reichen für ein brauchbares Wissensnetz nicht.
export type NoteLinkCandidate = {
  id: string;
  title: string;
  tags: string[];
  snippet?: string;
};

type EnhanceNoteParams = {
  config: ResolvedAiModelConfig;
  noteId: string;
  content: string;
  projects: Pick<Project, "id" | "title" | "description" | "keywords" | "aiEnabled">[];
  openTasks?: OpenTaskContext[];
  existingTags?: string[];
  otherNotes?: NoteLinkCandidate[];
  today?: string;
  locale?: Locale;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

type BuildEnhancementParams = {
  providerText: string;
  noteId: string;
  projectIds: string[];
  otherNoteIds: string[];
  nowIso?: string;
  idFactory?: (prefix: string) => string;
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
  // ID bleibt "kimi-k2-7" (steckt in gespeicherten Nutzer-Prefs); das
  // Modell dahinter ist K2.6 — den K2.7-Slug führt OpenRouter nur noch
  // als Code-Variante (moonshotai/kimi-k2.7-code), general-purpose gibt
  // es dort ausschließlich bis K2.6 (Katalog-Stand 2026-07).
  "kimi-k2-7": {
    provider: "chat-completions",
    keyEnv: "MOONSHOT_API_KEY",
    modelEnv: "MOONSHOT_KIMI_K2_7_MODEL",
    defaultModel: "kimi-k2.6",
    baseUrlEnv: "MOONSHOT_BASE_URL",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    openRouterModelEnv: "OPENROUTER_KIMI_K2_7_MODEL",
    defaultOpenRouterModel: "moonshotai/kimi-k2.6",
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

// Toleranter JSON-Parser: manche Modelle verpacken die Antwort in
// Markdown-Zäune oder umgeben sie mit Erklärtext.
export function parseProviderJson(value: string): unknown {
  const attempts: string[] = [value];

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    attempts.push(fenced[1]);
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start !== -1 && end > start) {
    attempts.push(value.slice(start, end + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Nächsten Kandidaten versuchen.
    }
  }

  throw new Error("KI-Antwort konnte nicht als JSON gelesen werden.");
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

type ProviderMessages = { system?: string; user: string };
type ProviderRequestOptions = {
  maxTokens: number;
  json: boolean;
  timeoutMs?: number;
  // Reasoning-Modelle "denken" bei Strukturaufgaben sonst zig Sekunden
  // (gemessen: 20 s → 5 s). Wirkt nur über OpenRouter.
  noReasoning?: boolean;
};

// Die Appwrite-Site kappt Requests nach ~30 s — ohne eigenes Timeout stirbt
// eine Route dann mit einem nackten 500 statt einer verständlichen Meldung.
// Der Worker (300-s-Function) übergibt eigene, großzügigere Budgets.
const DEFAULT_PROVIDER_TIMEOUT_MS = 25_000;

// name-basiert statt instanceof: Node-DOMExceptions erben nicht von Error.
function mapTimeoutError(error: unknown): unknown {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  if (name === "TimeoutError" || name === "AbortError") {
    return new Error(
      "Die KI-Antwort hat zu lange gedauert. Bitte versuche es erneut — bei Fotos hilft ein kleinerer Ausschnitt, bei Videos ein kürzeres Video.",
    );
  }
  return error;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw mapTimeoutError(error);
  }
}

// Gemeinsamer Provider-Aufruf für Notiz-Verarbeitung und Briefing.
async function requestProvider(
  config: ResolvedAiModelConfig,
  messages: ProviderMessages,
  options: ProviderRequestOptions,
  fetchFn: typeof fetch,
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;

  if (config.provider === "openai-responses") {
    const input = messages.system
      ? `${messages.system}\n\n${messages.user}`
      : messages.user;

    return fetchWithTimeout(
      fetchFn,
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: providerHeaders(config.apiKey),
        body: JSON.stringify({
          model: config.model,
          input: [
            {
              role: "user",
              content: input,
            },
          ],
          max_output_tokens: options.maxTokens,
          ...(options.json ? { text: { format: { type: "json_object" } } } : {}),
        }),
      },
      timeoutMs,
    );
  }

  if (!config.baseUrl) {
    throw new Error(`${config.label} ist ohne Base URL konfiguriert.`);
  }

  const chatMessages: Array<{ role: string; content: string }> = [];
  if (messages.system) {
    chatMessages.push({ role: "system", content: messages.system });
  }
  chatMessages.push({ role: "user", content: messages.user });

  return fetchWithTimeout(
    fetchFn,
    joinUrl(config.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: chatMessages,
        max_tokens: options.maxTokens,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        ...(config.baseUrl.includes("openrouter")
          ? {
              // Ohne Sortierung würfelt das Load-Balancing auch degradierte
              // Provider (gemessen 2026-07: DeepSeek hing ohne bis ins
              // 25-s-Timeout, mit Sortierung 3,5 s).
              provider: { sort: "throughput" },
              ...(options.noReasoning ? { reasoning: { enabled: false } } : {}),
            }
          : {}),
      }),
    },
    timeoutMs,
  );
}

export async function callEnhanceProvider({
  config,
  content,
  projects,
  openTasks = [],
  existingTags = [],
  otherNotes = [],
  today,
  locale = "de",
  timeoutMs,
  fetchFn = fetch,
}: EnhanceNoteParams): Promise<string> {
  const prompt = buildEnhancePrompt(
    content,
    projects,
    openTasks,
    existingTags,
    otherNotes,
    today,
    locale,
  );
  const system =
    locale === "en"
      ? "You refine raw notes into structured notes, tags, links, tasks and events. You respond exclusively with JSON."
      : "Du veredelst Rohnotizen zu strukturierten Notizen, Tags, Verknüpfungen, Aufgaben und Terminen. Du antwortest ausschließlich mit JSON.";

  const response = await requestProvider(
    config,
    { system, user: prompt },
    { maxTokens: 2400, json: true, timeoutMs },
    fetchFn,
  );

  const payload = await readJsonResponse(response, config.label);
  return extractProviderText(payload);
}

// Kompletter Veredelungslauf mit einem Wiederholungsversuch, falls die
// Antwort kein brauchbares JSON war. Provider-/HTTP-Fehler werden nicht
// wiederholt, sondern direkt gemeldet.
export async function enhanceNoteWithProvider(
  params: EnhanceNoteParams,
): Promise<NoteEnhancementResult> {
  const projectIds = params.projects
    .filter((project) => project.aiEnabled)
    .map((project) => project.id);
  const otherNoteIds = (params.otherNotes ?? []).map((note) => note.id);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const providerText = await callEnhanceProvider(params);
      return buildNoteEnhancementFromProviderText({
        providerText,
        noteId: params.noteId,
        projectIds,
        otherNoteIds,
      });
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Error && error.message.startsWith("KI-Antwort");
      if (!retryable) throw error;
    }
  }

  throw lastError;
}

const MAX_TAGS = 6;
const MAX_RELATED_NOTES = 8;

export function buildNoteEnhancementFromProviderText({
  providerText,
  noteId,
  projectIds,
  otherNoteIds,
  nowIso = new Date().toISOString(),
  idFactory = createId,
}: BuildEnhancementParams): NoteEnhancementResult {
  const payload = parseProviderJson(providerText);
  if (!isRecord(payload)) {
    throw new Error("KI-Antwort enthält kein gültiges Objekt.");
  }

  const knownProjects = new Set(projectIds);
  const knownNotes = new Set(otherNoteIds);
  const suggestionsPayload = readSuggestionsPayload(payload);

  const enhancement: NoteEnhancement = {
    title: readRequiredString(payload.title, "title").slice(0, 120),
    enhanced: readRequiredString(payload.enhanced, "enhanced"),
    tags: readTags(payload.tags),
    projectId: readKnownId(payload.projectId, knownProjects),
    relatedNoteIds: readRelatedNoteIds(payload.relatedNoteIds, knownNotes, noteId),
  };

  const suggestions = suggestionsPayload.map((suggestion, index) => {
    const normalized = normalizeSuggestion(
      suggestion,
      noteId,
      nowIso,
      idFactory(`suggestion-${index}`),
    );

    // Halluzinierte Projekt-IDs fliegen raus — als Zuordnung wie als
    // Verwandtschaft für die Farbwahl.
    const relatedProjectIds = normalized.relatedProjectIds.filter((projectId) =>
      knownProjects.has(projectId),
    );
    if (normalized.suggestedProjectId && !knownProjects.has(normalized.suggestedProjectId)) {
      return { ...normalized, suggestedProjectId: null, relatedProjectIds };
    }
    return { ...normalized, relatedProjectIds };
  });

  return { enhancement, suggestions };
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('KI-Antwort enthält kein gültiges Feld "tags".');
  }

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);

  return Array.from(new Set(tags)).slice(0, MAX_TAGS);
}

function readKnownId(value: unknown, known: Set<string>): string | null {
  if (typeof value !== "string") return null;
  return known.has(value) ? value : null;
}

function readRelatedNoteIds(value: unknown, known: Set<string>, selfId: string): string[] {
  if (!Array.isArray(value)) return [];

  const ids = value
    .filter((id): id is string => typeof id === "string")
    .filter((id) => id !== selfId && known.has(id));

  return Array.from(new Set(ids)).slice(0, MAX_RELATED_NOTES);
}

function readSuggestionsPayload(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.suggestions)) {
    throw new Error("KI-Antwort enthält keine gültige suggestions-Liste.");
  }

  // Eine leere Liste ist gültig: Die Notiz beschreibt nur bereits
  // vorhandene Aufgaben.
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
  const kind: SuggestionKind =
    value.kind === "event" ? "event" : value.kind === "project" ? "project" : "task";

  let dueDate = readNullableDate(value.dueDate);
  let eventStart: string | null = null;
  let eventEnd: string | null = null;

  if (kind === "event") {
    eventStart = readEventTime(value.eventStart, "eventStart");
    eventEnd =
      value.eventEnd === null || value.eventEnd === undefined
        ? null
        : readEventTime(value.eventEnd, "eventEnd");
    // Termine tragen ihr Datum immer auch als dueDate.
    dueDate = dueDate ?? eventStart.slice(0, 10);
  }

  const suggestedTitle = readRequiredString(value.suggestedTitle, "suggestedTitle");
  const suggestedNewProjectTitle = readNullableString(
    value.suggestedNewProjectTitle,
    "suggestedNewProjectTitle",
  );

  if (kind === "project") {
    // Projekt-Vorschlag: der Titel IST der Projektname; Termin- und
    // Zuordnungsfelder ergeben hier keinen Sinn und werden verworfen.
    return {
      id,
      rawNoteId,
      kind,
      suggestedTitle,
      suggestedDescription: readRequiredString(
        value.suggestedDescription,
        "suggestedDescription",
      ),
      suggestedProjectId: null,
      suggestedNewProjectTitle: suggestedNewProjectTitle ?? suggestedTitle,
      suggestedNoteIds: [],
      relatedProjectIds: readIdList(value.relatedProjectIds),
      confidence,
      priority,
      dueDate: null,
      eventStart: null,
      eventEnd: null,
      reasoning: readRequiredString(value.reasoning, "reasoning"),
      needsReview: readBoolean(value.needsReview, "needsReview"),
      state: "pending",
      createdAt,
    };
  }

  return {
    id,
    rawNoteId,
    kind,
    suggestedTitle,
    suggestedDescription: readRequiredString(
      value.suggestedDescription,
      "suggestedDescription",
    ),
    suggestedProjectId: readNullableString(value.suggestedProjectId, "suggestedProjectId"),
    suggestedNewProjectTitle,
    suggestedNoteIds: [],
    relatedProjectIds: [],
    confidence,
    priority,
    dueDate,
    eventStart,
    eventEnd,
    reasoning: readRequiredString(value.reasoning, "reasoning"),
    needsReview: readBoolean(value.needsReview, "needsReview"),
    state: "pending",
    createdAt,
  };
}

function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))),
  ).slice(0, 12);
}

function readEventTime(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`KI-Antwort enthält kein gültiges Feld "${field}".`);
  }

  return value;
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

const WEEKDAY_NAMES: Record<Locale, string[]> = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function describeToday(todayIso: string | undefined, locale: Locale) {
  const iso =
    todayIso && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
      ? todayIso
      : new Date().toISOString().slice(0, 10);
  const weekday = WEEKDAY_NAMES[locale][new Date(`${iso}T12:00:00Z`).getUTCDay()];

  return `${weekday}, ${iso}`;
}

const JSON_SHAPE =
  '{"title":"...","enhanced":"...","tags":["tag1","tag2"],"projectId":"project-id | null","relatedNoteIds":["note-id"],"suggestions":[{"kind":"task | event | project","suggestedTitle":"...","suggestedDescription":"...","suggestedProjectId":"project-id | null","suggestedNewProjectTitle":"... | null","relatedProjectIds":["project-id"],"confidence":0.0,"priority":"low|medium|high","dueDate":"YYYY-MM-DD | null","eventStart":"YYYY-MM-DDTHH:MM | null","eventEnd":"YYYY-MM-DDTHH:MM | null","reasoning":"...","needsReview":true}]}';

// Obergrenzen, damit der Prompt auch bei großen Datenmengen beherrschbar
// bleibt. Bewusst großzügig: Tags und Verlinkungen sollen den GESAMTEN
// Notizbestand kennen, damit ein konsistentes Wissensnetz entsteht.
const MAX_PROMPT_TASKS = 150;
const MAX_PROMPT_TASK_TITLE = 120;
const MAX_PROMPT_NOTES = 250;
const MAX_PROMPT_TAGS = 120;
const MAX_PROMPT_SNIPPET = 160;

function compactOpenTasks(openTasks: OpenTaskContext[]) {
  return openTasks.slice(0, MAX_PROMPT_TASKS).map((task) => ({
    title: task.title.slice(0, MAX_PROMPT_TASK_TITLE),
    projectId: task.projectId,
    dueDate: task.dueDate,
  }));
}

function compactNoteCandidates(notes: NoteLinkCandidate[]) {
  return notes.slice(0, MAX_PROMPT_NOTES).map((note) => ({
    id: note.id,
    title: note.title.slice(0, MAX_PROMPT_TASK_TITLE),
    tags: note.tags.slice(0, MAX_TAGS),
    ...(note.snippet?.trim()
      ? { snippet: note.snippet.trim().slice(0, MAX_PROMPT_SNIPPET) }
      : {}),
  }));
}

function buildEnhancePrompt(
  content: string,
  projects: Pick<Project, "id" | "title" | "description" | "keywords" | "aiEnabled">[],
  openTasks: OpenTaskContext[],
  existingTags: string[],
  otherNotes: NoteLinkCandidate[],
  today: string | undefined,
  locale: Locale,
) {
  const enabledProjects = projects
    .filter((project) => project.aiEnabled)
    .map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description,
      keywords: project.keywords,
    }));
  const existingTasks = compactOpenTasks(openTasks);
  const noteCandidates = compactNoteCandidates(otherNotes);
  const tags = existingTags.slice(0, MAX_PROMPT_TAGS);

  if (locale === "en") {
    return [
      "You are the structuring AI of the note app Rote Agenda.",
      `Today is ${describeToday(today, "en")}.`,
      "You receive one raw note. Respond exclusively with valid JSON in this shape:",
      JSON_SHAPE,
      "About the note itself:",
      "- title: a concise heading (max 60 characters).",
      "- enhanced: the note rewritten cleanly and well structured. Preserve the content, invent nothing. Plain text with paragraphs and simple dashes, no markdown syntax.",
      "- tags: 3 to 5 short lowercase keywords — a single tag almost never captures a note fully, so always assign at least 3. Strongly prefer existing tags when they fit (consistent tags across notes form a knowledge network), but do invent a new precise tag when nothing existing truly matches.",
      "- projectId: the id of the best-fitting enabled project, otherwise null. Projects are not just task containers but the app's categorization system for ideas, links, photos and knowledge notes too — assign generously whenever there is a genuine thematic fit.",
      "- relatedNoteIds: ids of ALL thematically related notes from the candidate list (max 8), otherwise an empty list. These links form a knowledge graph like in Obsidian — be generous with genuine thematic connections (same topic, person, place or project), but never invent links.",
      "About suggestions (0 to 4 entries):",
      '- kind "task": a concrete actionable task from the note. kind "event": an appointment with a recognizable date; set eventStart as local time YYYY-MM-DDTHH:MM (assume 09:00 if no time is given) and dueDate to the same date.',
      "- For an event, also propose sensible preparation tasks as separate task suggestions (e.g. bring documents).",
      '- kind "project": if NO enabled project fits (projectId is null) but the note clearly belongs to a larger topic or undertaking (this applies to pure idea, link, video or photo notes as well), suggest exactly ONE new project: suggestedTitle is a concise project name, suggestedDescription one sentence describing its purpose, relatedProjectIds lists existing projects of the same topic family (e.g. other coding projects — they will share a color family), otherwise an empty list, dueDate/eventStart/eventEnd null. Never suggest a project similar to an existing one, and skip the suggestion for one-off throwaway notes.',
      "- Convert relative expressions like today, tomorrow or Friday based on today's date.",
      "- Do not suggest tasks that already exist in the list of open tasks.",
      "- If the note contains no task, no event and no project-worthy topic, return an empty suggestions list.",
      "Write every text in English.",
      ...(tags.length ? ["Existing tags:", JSON.stringify(tags)] : []),
      ...(noteCandidates.length
        ? ["Existing notes (id, title, tags, snippet):", JSON.stringify(noteCandidates)]
        : []),
      ...(existingTasks.length
        ? ["Open tasks (JSON):", JSON.stringify(existingTasks)]
        : []),
      "Enabled projects:",
      JSON.stringify(enabledProjects),
      "Raw note:",
      content,
    ].join("\n");
  }

  return [
    "Du bist die strukturierende KI der Notiz-App Rote Agenda.",
    `Heute ist ${describeToday(today, "de")}.`,
    "Du bekommst eine Rohnotiz. Antworte ausschließlich mit gültigem JSON in dieser Form:",
    JSON_SHAPE,
    "Zur Notiz selbst:",
    "- title: eine prägnante Überschrift (maximal 60 Zeichen).",
    "- enhanced: die Notiz sauber ausformuliert und gut strukturiert. Inhalt bewahren, nichts dazuerfinden. Reiner Text mit Absätzen und einfachen Spiegelstrichen, keine Markdown-Syntax.",
    "- tags: 3 bis 5 kurze, kleingeschriebene Schlagwörter — ein einzelnes Tag greift fast immer zu kurz, vergib deshalb immer mindestens 3. Nutze bevorzugt vorhandene Tags, wenn sie passen (konsistente Tags über alle Notizen bilden ein Wissensnetz), aber erfinde ruhig ein treffendes neues, wenn keines wirklich passt.",
    "- projectId: die ID des am besten passenden aktivierten Projekts, sonst null. Projekte sind nicht nur Aufgaben-Container, sondern das Kategorisierungssystem der App — auch für Ideen, Links, Fotos und Wissens-Notizen. Ordne großzügig zu, sobald ein echter thematischer Bezug besteht.",
    "- relatedNoteIds: IDs ALLER thematisch verwandten Notizen aus der Kandidatenliste (maximal 8), sonst leere Liste. Diese Verknüpfungen bilden ein Wissensnetz wie in Obsidian — sei großzügig bei echten thematischen Bezügen (gleiches Thema, Person, Ort oder Projekt), aber erfinde keine.",
    "Zu den Vorschlägen (suggestions, 0 bis 4 Einträge):",
    '- kind "task": eine konkrete Aufgabe aus der Notiz. kind "event": ein Termin mit erkennbarem Datum; setze eventStart als lokale Zeit YYYY-MM-DDTHH:MM (ohne erkennbare Uhrzeit 09:00 annehmen) und dueDate auf dasselbe Datum.',
    "- Zu einem Termin gehören sinnvolle Vorbereitungs-Aufgaben als eigene task-Vorschläge (z. B. Unterlagen mitnehmen).",
    '- kind "project": Passt KEIN aktiviertes Projekt (projectId ist null), gehört die Notiz aber klar zu einem größeren Thema oder Vorhaben (auch reine Ideen-, Link-, Video- oder Foto-Notizen), schlage genau EIN neues Projekt vor: suggestedTitle ist ein prägnanter Projektname, suggestedDescription ein Satz zum Zweck, relatedProjectIds nennt vorhandene Projekte derselben Themenfamilie (z. B. weitere Coding-Projekte — sie teilen sich dann eine Farbfamilie), sonst leere Liste, dueDate/eventStart/eventEnd null. Schlage nie ein Projekt vor, das einem vorhandenen ähnelt, und keines für belanglose Wegwerf-Notizen.',
    "- Rechne relative Angaben wie heute, morgen oder Freitag vom heutigen Datum aus um.",
    "- Schlage keine Aufgabe vor, die bereits in der Liste offener Aufgaben existiert.",
    "- Enthält die Notiz weder Aufgabe noch Termin noch ein projektwürdiges Thema, gib eine leere suggestions-Liste zurück.",
    "Formuliere alle Texte auf Deutsch.",
    ...(tags.length ? ["Vorhandene Tags:", JSON.stringify(tags)] : []),
    ...(noteCandidates.length
      ? ["Vorhandene Notizen (id, title, tags, snippet):", JSON.stringify(noteCandidates)]
      : []),
    ...(existingTasks.length
      ? ["Offene Aufgaben (JSON):", JSON.stringify(existingTasks)]
      : []),
    "Aktivierte Projekte:",
    JSON.stringify(enabledProjects),
    "Rohnotiz:",
    content,
  ].join("\n");
}

function providerHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readJsonResponse(response: Response, providerLabel: string) {
  let text: string;
  try {
    // Das Abort-Signal des Requests kappt auch das Body-Lesen.
    text = await response.text();
  } catch (error) {
    throw mapTimeoutError(error);
  }

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

// ── Medien über OpenRouter (Sprachnotiz + Foto-Notiz + Video) ───────

// MiMo-V2.5 (nicht -Pro!) kann Audio- UND Bild-Eingabe und ist deutlich
// günstiger als Gemini 2.5 Flash. Override via Env möglich.
const DEFAULT_TRANSCRIBE_MODEL = "xiaomi/mimo-v2.5";
// Nicht mimo: dessen OpenRouter-Provider hängen bei Bild-Anfragen häufig
// bis ins Timeout (gemessen 3/4 Läufe), Gemini über Google antwortet
// stabil in ~2 s bei praktisch gleichen Kosten pro Foto.
const DEFAULT_VISION_MODEL = "google/gemini-3.1-flash-lite";
// YouTube-URLs versteht via OpenRouter nur Gemini (Provider "Google AI
// Studio"); 3.1 Flash Lite ist der Preis/Leistungs-Sweet-Spot (GA, 1M ctx).
const DEFAULT_VIDEO_MODEL = "google/gemini-3.1-flash-lite";

type TranscribeParams = {
  audioBase64: string;
  format: "wav" | "mp3";
  locale?: Locale;
  timeoutMs?: number;
  env?: Env;
  fetchFn?: typeof fetch;
};

type ExtractImageParams = {
  imageBase64: string;
  locale?: Locale;
  timeoutMs?: number;
  env?: Env;
  fetchFn?: typeof fetch;
};

type MediaResolveResult =
  | { ok: true; apiKey: string; model: string; baseUrl: string }
  | { ok: false; error: string; status: number };

function resolveOpenRouterMedia(
  env: Env,
  modelEnvName: string,
  defaultModel: string,
  purpose: string,
): MediaResolveResult {
  const apiKey = env[OPENROUTER_KEY_ENV]?.trim();

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: `${purpose} benötigt ${OPENROUTER_KEY_ENV}. Bitte setze die Environment Variable in Appwrite/Next.`,
    };
  }

  return {
    ok: true,
    apiKey,
    model: env[modelEnvName]?.trim() || defaultModel,
    baseUrl: env[OPENROUTER_BASE_URL_ENV]?.trim() || DEFAULT_OPENROUTER_BASE_URL,
  };
}

export function resolveTranscriptionConfig(env: Env = process.env): MediaResolveResult {
  return resolveOpenRouterMedia(
    env,
    "OPENROUTER_TRANSCRIBE_MODEL",
    DEFAULT_TRANSCRIBE_MODEL,
    "Die Sprachtranskription",
  );
}

export function resolveVisionConfig(env: Env = process.env): MediaResolveResult {
  return resolveOpenRouterMedia(
    env,
    "OPENROUTER_VISION_MODEL",
    DEFAULT_VISION_MODEL,
    "Die Foto-Erkennung",
  );
}

export function resolveVideoConfig(env: Env = process.env): MediaResolveResult {
  return resolveOpenRouterMedia(
    env,
    "OPENROUTER_VIDEO_MODEL",
    DEFAULT_VIDEO_MODEL,
    "Die Video-Analyse",
  );
}

export async function transcribeAudio({
  audioBase64,
  format,
  locale = "de",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  env = process.env,
  fetchFn = fetch,
}: TranscribeParams): Promise<string> {
  const config = resolveTranscriptionConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }

  const instruction =
    locale === "en"
      ? "Transcribe this voice note verbatim in the language it is spoken in. Return only the transcribed text, without quotes or comments."
      : "Transkribiere diese Sprachnotiz wörtlich in der gesprochenen Sprache. Gib ausschließlich den transkribierten Text zurück, ohne Anführungszeichen oder Kommentare.";

  const response = await fetchWithTimeout(
    fetchFn,
    joinUrl(config.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              {
                type: "input_audio",
                input_audio: { data: audioBase64, format },
              },
            ],
          },
        ],
        max_tokens: 2000,
        ...(config.baseUrl.includes("openrouter")
          ? { reasoning: { enabled: false } }
          : {}),
      }),
    },
    timeoutMs,
  );

  const payload = await readJsonResponse(response, "Transkription");
  const text = extractProviderText(payload).trim();

  if (!text) {
    throw new Error("Die Transkription hat keinen Text erkannt.");
  }

  return text;
}

export async function extractImageText({
  imageBase64,
  locale = "de",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  env = process.env,
  fetchFn = fetch,
}: ExtractImageParams): Promise<string> {
  const config = resolveVisionConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }

  const instruction =
    locale === "en"
      ? "Read this image (photo of a sticky note, whiteboard, notebook page, or a screenshot) and extract the text it contains as a compact note. Put each task-like item on its own line. Return only the extracted text, without comments."
      : "Lies dieses Bild (Foto eines Zettels, Whiteboards, einer Notizbuchseite oder ein Screenshot) und extrahiere den enthaltenen Text als kompakte Notiz. Setze jeden aufgabenähnlichen Punkt in eine eigene Zeile. Gib ausschließlich den extrahierten Text zurück, ohne Kommentare.";

  const response = await fetchWithTimeout(
    fetchFn,
    joinUrl(config.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
        // Textreiche Screenshots brauchen Luft — und ohne abgeschaltetes
        // Reasoning zählt sonst das "Denken" mit ins Budget, bis kein
        // sichtbarer Text mehr übrig bleibt ("kein Text erkannt").
        max_tokens: 4000,
        ...(config.baseUrl.includes("openrouter")
          ? { reasoning: { enabled: false } }
          : {}),
      }),
    },
    timeoutMs,
  );

  const payload = await readJsonResponse(response, "Foto-Erkennung");
  const text = extractProviderText(payload).trim();

  if (!text) {
    throw new Error("Auf dem Foto wurde kein Text erkannt.");
  }

  return text;
}

// ── URL/YouTube → Notiz-Zusammenfassung ─────────────────────────────

const MAX_PAGE_TEXT = 12_000;

type SummarizeWebParams = {
  config: ResolvedAiModelConfig;
  pageText: string;
  url: string;
  title?: string | null;
  locale?: Locale;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

// Fasst extrahierten Seitentext mit dem Konto-Modell als Notiz zusammen.
export async function summarizeWebText({
  config,
  pageText,
  url,
  title,
  locale = "de",
  timeoutMs,
  fetchFn = fetch,
}: SummarizeWebParams): Promise<string> {
  const text = pageText.slice(0, MAX_PAGE_TEXT);

  const prompt =
    locale === "en"
      ? [
          "Summarize this web page as a compact note (at most ~180 words):",
          "key statements, important facts, and explicitly mention any tasks, dates or deadlines that appear.",
          "Plain text with paragraphs or simple dashes, no markdown syntax, no preamble.",
          `Respond in English.`,
          title ? `Page title: ${title}` : "",
          `URL: ${url}`,
          "Page text (possibly truncated):",
          text,
        ]
      : [
          "Fasse diese Webseite als kompakte Notiz zusammen (maximal ~180 Wörter):",
          "Kernaussagen, wichtige Fakten, und nenne explizit alle erwähnten Aufgaben, Termine oder Fristen.",
          "Reiner Text mit Absätzen oder einfachen Spiegelstrichen, keine Markdown-Syntax, keine Vorrede.",
          "Antworte auf Deutsch.",
          title ? `Seitentitel: ${title}` : "",
          `URL: ${url}`,
          "Seitentext (ggf. gekürzt):",
          text,
        ];

  const response = await requestProvider(
    config,
    { user: prompt.filter(Boolean).join("\n") },
    { maxTokens: 600, json: false, timeoutMs },
    fetchFn,
  );

  const payload = await readJsonResponse(response, config.label);
  const summary = extractProviderText(payload).trim();
  if (!summary) {
    throw new Error("Die Zusammenfassung hat keinen Text geliefert.");
  }

  return summary;
}

type SummarizeYouTubeParams = {
  url: string;
  title?: string | null;
  author?: string | null;
  locale?: Locale;
  timeoutMs?: number;
  env?: Env;
  fetchFn?: typeof fetch;
};

// Lässt Gemini das YouTube-Video tatsächlich "ansehen" (Frames + Audio).
// Nur der Provider "Google AI Studio" akzeptiert YouTube-URLs.
export async function summarizeYouTubeVideo({
  url,
  title,
  author,
  locale = "de",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  env = process.env,
  fetchFn = fetch,
}: SummarizeYouTubeParams): Promise<string> {
  const config = resolveVideoConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }

  const context = [title, author ? `(${author})` : ""].filter(Boolean).join(" ");
  const instruction =
    locale === "en"
      ? [
          "Watch this video and summarize it as a compact note (at most ~200 words):",
          "core statements, structure/chapters, and explicitly mention any tasks, dates or recommendations.",
          "Plain text, no markdown syntax, no preamble. Respond in English.",
          context ? `Video: ${context}` : "",
        ]
      : [
          "Sieh dir dieses Video an und fasse es als kompakte Notiz zusammen (maximal ~200 Wörter):",
          "Kernaussagen, Struktur/Kapitel, und nenne explizit erwähnte Aufgaben, Termine oder Empfehlungen.",
          "Reiner Text, keine Markdown-Syntax, keine Vorrede. Antworte auf Deutsch.",
          context ? `Video: ${context}` : "",
        ];

  const response = await fetchWithTimeout(
    fetchFn,
    joinUrl(config.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction.filter(Boolean).join("\n") },
              { type: "video_url", video_url: { url } },
            ],
          },
        ],
        max_tokens: 800,
        // Vertex akzeptiert keine Video-URLs — AI Studio bevorzugen.
        provider: { order: ["google-ai-studio"] },
        ...(config.baseUrl.includes("openrouter")
          ? { reasoning: { enabled: false } }
          : {}),
      }),
    },
    timeoutMs,
  );

  const payload = await readJsonResponse(response, "Video-Analyse");
  const summary = extractProviderText(payload).trim();
  if (!summary) {
    throw new Error("Die Video-Analyse hat keinen Inhalt geliefert.");
  }

  return summary;
}

// ── Tagesbriefing ────────────────────────────────────────────────────

export type BriefingTask = {
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  project: string | null;
};

type BriefingParams = {
  config: ResolvedAiModelConfig;
  tasks: BriefingTask[];
  today?: string;
  locale?: Locale;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

const MAX_BRIEFING_TASKS = 100;

function buildBriefingPrompt(tasks: BriefingTask[], today: string | undefined, locale: Locale) {
  const compact = tasks.slice(0, MAX_BRIEFING_TASKS).map((task) => ({
    title: task.title.slice(0, MAX_PROMPT_TASK_TITLE),
    dueDate: task.dueDate,
    priority: task.priority,
    project: task.project,
  }));

  if (locale === "en") {
    return [
      `Today is ${describeToday(today, "en")}.`,
      "Create a short daily briefing from the open tasks below: overdue items first, then what is due today, then at most three other important points.",
      "At most 120 words, no heading. Address the user directly.",
      "Open tasks (JSON):",
      JSON.stringify(compact),
      "Respond in English with the briefing text only.",
    ].join("\n");
  }

  return [
    `Heute ist ${describeToday(today, "de")}.`,
    "Erstelle aus den offenen Aufgaben unten ein kurzes Tagesbriefing: zuerst Überfälliges, dann heute Fälliges, dann höchstens drei weitere wichtige Punkte.",
    "Maximal 120 Wörter, keine Überschrift. Sprich die Nutzerin/den Nutzer direkt in Du-Form an.",
    "Offene Aufgaben (JSON):",
    JSON.stringify(compact),
    "Antworte auf Deutsch nur mit dem Briefing-Text.",
  ].join("\n");
}

export async function generateDailyBriefing({
  config,
  tasks,
  today,
  locale = "de",
  timeoutMs,
  fetchFn = fetch,
}: BriefingParams): Promise<string> {
  const prompt = buildBriefingPrompt(tasks, today, locale);
  const system =
    locale === "en"
      ? "You are the daily assistant of Rote Agenda. You answer with a short, friendly briefing in plain text."
      : "Du bist der Tagesassistent von Rote Agenda. Du antwortest mit einem kurzen, freundlichen Briefing als Fließtext.";

  const response = await requestProvider(
    config,
    { system, user: prompt },
    { maxTokens: 400, json: false, timeoutMs },
    fetchFn,
  );

  const payload = await readJsonResponse(response, config.label);
  return extractProviderText(payload).trim();
}

// ── Batch-Kategorisierung von Bestandsnotizen ───────────────────────

export type CategorizeNoteInput = {
  id: string;
  title: string;
  tags: string[];
  snippet: string;
};

export type CategorizeProjectInput = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
};

export type NoteCategorization = {
  assignments: Array<{ noteId: string; projectId: string }>;
  newProjects: Array<{
    title: string;
    description: string;
    reason: string;
    noteIds: string[];
    relatedProjectIds: string[];
  }>;
};

type CategorizeParams = {
  config: ResolvedAiModelConfig;
  notes: CategorizeNoteInput[];
  projects: CategorizeProjectInput[];
  locale?: Locale;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

const CATEGORIZE_JSON_SHAPE =
  '{"assignments":[{"noteId":"...","projectId":"..."}],"newProjects":[{"title":"...","description":"...","reason":"...","noteIds":["note-id"],"relatedProjectIds":["project-id"]}]}';

function buildCategorizePrompt(
  notes: CategorizeNoteInput[],
  projects: CategorizeProjectInput[],
  locale: Locale,
) {
  const compactNotes = notes.map((note) => ({
    id: note.id,
    t: note.title.slice(0, 80),
    g: note.tags.slice(0, MAX_TAGS),
    s: note.snippet.slice(0, 160),
  }));

  if (locale === "en") {
    return [
      "You are the structuring AI of the note app Rote Agenda. Projects are the app's categorization system — for ideas, links, photos and knowledge notes, not just tasks.",
      "You receive the user's UNASSIGNED notes (id, t=title, g=tags, s=snippet) plus the existing projects. Respond exclusively with valid JSON in this shape:",
      CATEGORIZE_JSON_SHAPE,
      "- assignments: every note that genuinely fits an EXISTING project. Only real thematic fits — leave notes out rather than forcing them.",
      "- newProjects: when several remaining notes clearly belong to one larger topic or undertaking, propose ONE project for them: title is a concise project name, description one sentence of purpose, reason explains briefly why these notes belong together, noteIds lists the matching notes, relatedProjectIds lists existing projects of the same topic family (they will share a color family), otherwise an empty list. Only propose a project for at least two related notes or one clearly project-worthy undertaking; never one similar to an existing project; skip throwaway notes.",
      "- A note appears at most once across assignments and newProjects. Notes that fit nowhere are simply omitted.",
      "Write every text in English.",
      "Existing projects:",
      JSON.stringify(projects),
      "Unassigned notes:",
      JSON.stringify(compactNotes),
    ].join("\n");
  }

  return [
    "Du bist die strukturierende KI der Notiz-App Rote Agenda. Projekte sind das Kategorisierungssystem der App — für Ideen, Links, Fotos und Wissens-Notizen, nicht nur für Aufgaben.",
    "Du bekommst die UNZUGEORDNETEN Notizen des Nutzers (id, t=Titel, g=Tags, s=Snippet) sowie die vorhandenen Projekte. Antworte ausschließlich mit gültigem JSON in dieser Form:",
    CATEGORIZE_JSON_SHAPE,
    "- assignments: jede Notiz, die wirklich zu einem VORHANDENEN Projekt passt. Nur echte thematische Treffer — lass Notizen lieber weg, statt sie zu erzwingen.",
    "- newProjects: Gehören mehrere übrige Notizen klar zu einem größeren Thema oder Vorhaben, schlage dafür EIN Projekt vor: title ist ein prägnanter Projektname, description ein Satz zum Zweck, reason begründet kurz, warum diese Notizen zusammengehören, noteIds listet die passenden Notizen, relatedProjectIds nennt vorhandene Projekte derselben Themenfamilie (sie teilen sich dann eine Farbfamilie), sonst leere Liste. Schlage ein Projekt nur für mindestens zwei zusammengehörige Notizen oder ein klar projektwürdiges Vorhaben vor; nie eines, das einem vorhandenen ähnelt; belanglose Wegwerf-Notizen überspringst du.",
    "- Jede Notiz taucht höchstens einmal auf — über assignments und newProjects hinweg. Notizen, die nirgends passen, lässt du einfach weg.",
    "Formuliere alle Texte auf Deutsch.",
    "Vorhandene Projekte:",
    JSON.stringify(projects),
    "Unzugeordnete Notizen:",
    JSON.stringify(compactNotes),
  ].join("\n");
}

export function buildCategorizationFromProviderText(
  providerText: string,
  noteIds: string[],
  projectIds: string[],
): NoteCategorization {
  const payload = parseProviderJson(providerText);
  if (!isRecord(payload)) {
    throw new Error("KI-Antwort enthält kein gültiges Objekt.");
  }

  const knownNotes = new Set(noteIds);
  const knownProjects = new Set(projectIds);
  // Jede Notiz höchstens einmal — halluzinierte oder doppelte IDs fallen raus.
  const usedNotes = new Set<string>();

  const assignments = (Array.isArray(payload.assignments) ? payload.assignments : [])
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const noteId = typeof entry.noteId === "string" ? entry.noteId : "";
      const projectId = typeof entry.projectId === "string" ? entry.projectId : "";
      if (!knownNotes.has(noteId) || !knownProjects.has(projectId)) return [];
      if (usedNotes.has(noteId)) return [];
      usedNotes.add(noteId);
      return [{ noteId, projectId }];
    });

  const newProjects = (Array.isArray(payload.newProjects) ? payload.newProjects : [])
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      if (!title) return [];
      const ids = (Array.isArray(entry.noteIds) ? entry.noteIds : [])
        .filter(
          (noteId): noteId is string =>
            typeof noteId === "string" && knownNotes.has(noteId) && !usedNotes.has(noteId),
        );
      if (!ids.length) return [];
      ids.forEach((noteId) => usedNotes.add(noteId));
      return [
        {
          title: title.slice(0, 120),
          description:
            typeof entry.description === "string" ? entry.description.trim() : "",
          reason: typeof entry.reason === "string" ? entry.reason.trim() : "",
          noteIds: ids,
          relatedProjectIds: (Array.isArray(entry.relatedProjectIds)
            ? entry.relatedProjectIds
            : []
          ).filter(
            (projectId): projectId is string =>
              typeof projectId === "string" && knownProjects.has(projectId),
          ),
        },
      ];
    });

  return { assignments, newProjects };
}

// Ordnet unzugeordnete Bestandsnotizen vorhandenen Projekten zu und
// bündelt den Rest zu Neues-Projekt-Vorschlägen — ein Provider-Aufruf
// pro Notiz-Block, mit dem üblichen einen JSON-Retry.
export async function categorizeNotesWithProvider({
  config,
  notes,
  projects,
  locale = "de",
  timeoutMs,
  fetchFn = fetch,
}: CategorizeParams): Promise<NoteCategorization> {
  const prompt = buildCategorizePrompt(notes, projects, locale);
  const system =
    locale === "en"
      ? "You assign notes to projects and respond exclusively with JSON."
      : "Du ordnest Notizen Projekten zu und antwortest ausschließlich mit JSON.";
  const noteIds = notes.map((note) => note.id);
  const projectIds = projects.map((project) => project.id);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await requestProvider(
        config,
        { system, user: prompt },
        { maxTokens: 3000, json: true, timeoutMs, noReasoning: true },
        fetchFn,
      );
      const payload = await readJsonResponse(response, config.label);
      return buildCategorizationFromProviderText(
        extractProviderText(payload),
        noteIds,
        projectIds,
      );
    } catch (error) {
      lastError = error;
      const retryable = error instanceof Error && error.message.startsWith("KI-Antwort");
      if (!retryable) throw error;
    }
  }

  throw lastError;
}

// ── Wissensnetz-Analyse ─────────────────────────────────────────────

export type GraphInsightNode = {
  title: string;
  tags: string[];
  project: string | null;
  degree: number;
};

export type GraphInsights = {
  summary: string;
  clusters: string[];
  anomalies: string[];
  gaps: string[];
  suggestions: string[];
};

type GraphInsightsParams = {
  config: ResolvedAiModelConfig;
  nodes: GraphInsightNode[];
  // Verlinkungen als Indexpaare in nodes (nur Notiz↔Notiz; Tags stecken
  // bereits in den Knoten selbst).
  edges: Array<[number, number]>;
  locale?: Locale;
  timeoutMs?: number;
  // Tiefenanalyse des Workers: ausführlichere Antwort ohne 25-s-Druck.
  detail?: boolean;
  fetchFn?: typeof fetch;
};

export const MAX_INSIGHT_NODES = 250;
export const MAX_INSIGHT_EDGES = 800;
const MAX_INSIGHT_LIST_ITEMS = 6;
const MAX_DETAIL_LIST_ITEMS = 12;

const INSIGHTS_JSON_SHAPE =
  '{"summary":"...","clusters":["..."],"anomalies":["..."],"gaps":["..."],"suggestions":["..."]}';

function buildInsightsPrompt(
  nodes: GraphInsightNode[],
  edges: Array<[number, number]>,
  locale: Locale,
  detail = false,
) {
  const compact = nodes.slice(0, MAX_INSIGHT_NODES).map((node) => ({
    t: node.title.slice(0, 80),
    g: node.tags.slice(0, MAX_TAGS),
    p: node.project,
    d: node.degree,
  }));
  const compactEdges = edges.slice(0, MAX_INSIGHT_EDGES);

  if (locale === "en") {
    return [
      "You are the analysis AI of the note app Rote Agenda. You are looking at a user's knowledge graph:",
      "notes as nodes (t=title, g=tags, p=project, d=number of connections) and note-to-note links as index pairs into the node list.",
      "Respond exclusively with valid JSON in this shape:",
      INSIGHTS_JSON_SHAPE,
      ...(detail
        ? [
            "This is the DEEP analysis — take your time and be thorough:",
            "- summary: 1-2 substantial paragraphs describing what this knowledge graph revolves around, how its themes relate, and how it has been developing.",
            "- clusters: every real thematic cluster with its central notes and what holds it together (max 12 entries, 1-3 sentences each).",
            "- anomalies: notable patterns, e.g. surprising bridges between topics, unusual hubs, duplicate or synonymous tags — explain why each is notable (max 12).",
            "- gaps: isolated notes or groups, obvious but missing links, topics without a project — name the affected notes (max 12).",
            "- suggestions: concrete, actionable next steps to improve the graph, most valuable first (max 8).",
          ]
        : [
            "- summary: 2-4 sentences describing what this knowledge graph revolves around as a whole.",
            "- clusters: the main thematic clusters with their central notes (max 5 entries).",
            "- anomalies: notable patterns, e.g. surprising bridges between topics, unusual hubs, duplicate or synonymous tags (max 5).",
            "- gaps: gaps in the graph: isolated notes or groups, obvious but missing links, topics without a project (max 5).",
            "- suggestions: concrete next steps to improve the graph (max 4).",
          ]),
      "Be specific and reference note titles. Never invent notes. Empty lists are allowed. Write every text in English.",
      "Graph (JSON):",
      JSON.stringify({ nodes: compact, edges: compactEdges }),
    ].join("\n");
  }

  return [
    "Du bist die Analyse-KI der Notiz-App Rote Agenda. Vor dir liegt das Wissensnetz einer Nutzerin/eines Nutzers:",
    "Notizen als Knoten (t=Titel, g=Tags, p=Projekt, d=Anzahl Verbindungen) und Notiz-zu-Notiz-Verlinkungen als Indexpaare in die Knotenliste.",
    "Antworte ausschließlich mit gültigem JSON in dieser Form:",
    INSIGHTS_JSON_SHAPE,
    ...(detail
      ? [
          "Dies ist die TIEFENANALYSE — nimm dir Zeit und sei gründlich:",
          "- summary: 1-2 gehaltvolle Absätze: worum kreist dieses Wissensnetz, wie hängen die Themen zusammen, wie entwickelt es sich.",
          "- clusters: jedes echte Themen-Cluster mit seinen zentralen Notizen und dem, was es zusammenhält (maximal 12 Einträge, je 1-3 Sätze).",
          "- anomalies: Auffälligkeiten, z. B. überraschende Brücken zwischen Themen, ungewöhnliche Knotenpunkte, doppelte oder synonyme Tags — begründe jeweils, warum das auffällt (maximal 12).",
          "- gaps: isolierte Notizen oder Gruppen, naheliegende aber fehlende Verbindungen, Themen ohne Projekt — nenne die betroffenen Notizen (maximal 12).",
          "- suggestions: konkrete, umsetzbare nächste Schritte für ein besseres Netz, das Wertvollste zuerst (maximal 8).",
        ]
      : [
          "- summary: 2-4 Sätze: worum kreist dieses Wissensnetz insgesamt.",
          "- clusters: die wichtigsten Themen-Cluster mit ihren zentralen Notizen (maximal 5 Einträge).",
          "- anomalies: Auffälligkeiten, z. B. überraschende Brücken zwischen Themen, ungewöhnliche Knotenpunkte, doppelte oder synonyme Tags (maximal 5).",
          "- gaps: Lücken im Netz: isolierte Notizen oder Gruppen, naheliegende aber fehlende Verbindungen, Themen ohne Projekt (maximal 5).",
          "- suggestions: konkrete nächste Schritte für ein besseres Netz (maximal 4).",
        ]),
    "Sei konkret und beziehe dich auf Notiz-Titel. Erfinde keine Notizen. Leere Listen sind erlaubt. Formuliere alle Texte auf Deutsch.",
    "Netz (JSON):",
    JSON.stringify({ nodes: compact, edges: compactEdges }),
  ].join("\n");
}

export function buildGraphInsightsFromProviderText(
  providerText: string,
  maxItems = MAX_INSIGHT_LIST_ITEMS,
): GraphInsights {
  const payload = parseProviderJson(providerText);
  if (!isRecord(payload)) {
    throw new Error("KI-Antwort enthält kein gültiges Objekt.");
  }

  return {
    summary: readRequiredString(payload.summary, "summary"),
    clusters: readInsightList(payload.clusters, maxItems),
    anomalies: readInsightList(payload.anomalies, maxItems),
    gaps: readInsightList(payload.gaps, maxItems),
    suggestions: readInsightList(payload.suggestions, maxItems),
  };
}

function readInsightList(value: unknown, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("KI-Antwort enthält eine ungültige Liste.");
  }

  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .slice(0, maxItems);
}

// Analyse-Lauf mit einem Wiederholungsversuch bei unbrauchbarem JSON —
// Provider-/HTTP-Fehler werden wie überall direkt gemeldet.
export async function generateGraphInsights({
  config,
  nodes,
  edges,
  locale = "de",
  timeoutMs,
  detail = false,
  fetchFn = fetch,
}: GraphInsightsParams): Promise<GraphInsights> {
  const prompt = buildInsightsPrompt(nodes, edges, locale, detail);
  const system =
    locale === "en"
      ? "You analyze knowledge graphs of notes and respond exclusively with JSON."
      : "Du analysierst Wissensnetze aus Notizen und antwortest ausschließlich mit JSON.";
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await requestProvider(
        config,
        { system, user: prompt },
        // 1000 Tokens reichten bei großen Netzen nicht: Antworten endeten
        // mit finish_reason "length" mitten im JSON → Parse-Fehler → Retry
        // → Timeout-Kette. Die Tiefenanalyse darf deutlich länger schreiben.
        { maxTokens: detail ? 6000 : 2500, json: true, timeoutMs, noReasoning: true },
        fetchFn,
      );
      const payload = await readJsonResponse(response, config.label);
      return buildGraphInsightsFromProviderText(
        extractProviderText(payload),
        detail ? MAX_DETAIL_LIST_ITEMS : MAX_INSIGHT_LIST_ITEMS,
      );
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Error && error.message.startsWith("KI-Antwort");
      if (!retryable) throw error;
    }
  }

  throw lastError;
}
