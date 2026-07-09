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
type ProviderRequestOptions = { maxTokens: number; json: boolean };

// Gemeinsamer Provider-Aufruf für Notiz-Verarbeitung und Briefing.
async function requestProvider(
  config: ResolvedAiModelConfig,
  messages: ProviderMessages,
  options: ProviderRequestOptions,
  fetchFn: typeof fetch,
) {
  if (config.provider === "openai-responses") {
    const input = messages.system
      ? `${messages.system}\n\n${messages.user}`
      : messages.user;

    return fetchFn("https://api.openai.com/v1/responses", {
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
    });
  }

  if (!config.baseUrl) {
    throw new Error(`${config.label} ist ohne Base URL konfiguriert.`);
  }

  const chatMessages: Array<{ role: string; content: string }> = [];
  if (messages.system) {
    chatMessages.push({ role: "system", content: messages.system });
  }
  chatMessages.push({ role: "user", content: messages.user });

  return fetchFn(joinUrl(config.baseUrl, "chat/completions"), {
    method: "POST",
    headers: providerHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      messages: chatMessages,
      max_tokens: options.maxTokens,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
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
    { maxTokens: 2400, json: true },
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

    // Halluzinierte Projekt-IDs werden zu "neues Projekt"-Vorschlägen.
    if (normalized.suggestedProjectId && !knownProjects.has(normalized.suggestedProjectId)) {
      return { ...normalized, suggestedProjectId: null };
    }
    return normalized;
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
  const kind: SuggestionKind = value.kind === "event" ? "event" : "task";

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

  return {
    id,
    rawNoteId,
    kind,
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
    dueDate,
    eventStart,
    eventEnd,
    reasoning: readRequiredString(value.reasoning, "reasoning"),
    needsReview: readBoolean(value.needsReview, "needsReview"),
    state: "pending",
    createdAt,
  };
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
  '{"title":"...","enhanced":"...","tags":["tag1","tag2"],"projectId":"project-id | null","relatedNoteIds":["note-id"],"suggestions":[{"kind":"task | event","suggestedTitle":"...","suggestedDescription":"...","suggestedProjectId":"project-id | null","suggestedNewProjectTitle":"... | null","confidence":0.0,"priority":"low|medium|high","dueDate":"YYYY-MM-DD | null","eventStart":"YYYY-MM-DDTHH:MM | null","eventEnd":"YYYY-MM-DDTHH:MM | null","reasoning":"...","needsReview":true}]}';

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
      "- tags: 1 to 5 short lowercase keywords. Strongly prefer existing tags when they fit — consistent tags across notes form a knowledge network.",
      "- projectId: the id of the best-fitting enabled project, otherwise null.",
      "- relatedNoteIds: ids of ALL thematically related notes from the candidate list (max 8), otherwise an empty list. These links form a knowledge graph like in Obsidian — be generous with genuine thematic connections (same topic, person, place or project), but never invent links.",
      "About suggestions (0 to 4 entries):",
      '- kind "task": a concrete actionable task from the note. kind "event": an appointment with a recognizable date; set eventStart as local time YYYY-MM-DDTHH:MM (assume 09:00 if no time is given) and dueDate to the same date.',
      "- For an event, also propose sensible preparation tasks as separate task suggestions (e.g. bring documents).",
      "- Convert relative expressions like today, tomorrow or Friday based on today's date.",
      "- Do not suggest tasks that already exist in the list of open tasks.",
      "- If the note contains neither a task nor an event, return an empty suggestions list.",
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
    "- tags: 1 bis 5 kurze, kleingeschriebene Schlagwörter. Nutze bevorzugt vorhandene Tags, wenn sie passen — konsistente Tags über alle Notizen bilden ein Wissensnetz.",
    "- projectId: die ID des am besten passenden aktivierten Projekts, sonst null.",
    "- relatedNoteIds: IDs ALLER thematisch verwandten Notizen aus der Kandidatenliste (maximal 8), sonst leere Liste. Diese Verknüpfungen bilden ein Wissensnetz wie in Obsidian — sei großzügig bei echten thematischen Bezügen (gleiches Thema, Person, Ort oder Projekt), aber erfinde keine.",
    "Zu den Vorschlägen (suggestions, 0 bis 4 Einträge):",
    '- kind "task": eine konkrete Aufgabe aus der Notiz. kind "event": ein Termin mit erkennbarem Datum; setze eventStart als lokale Zeit YYYY-MM-DDTHH:MM (ohne erkennbare Uhrzeit 09:00 annehmen) und dueDate auf dasselbe Datum.',
    "- Zu einem Termin gehören sinnvolle Vorbereitungs-Aufgaben als eigene task-Vorschläge (z. B. Unterlagen mitnehmen).",
    "- Rechne relative Angaben wie heute, morgen oder Freitag vom heutigen Datum aus um.",
    "- Schlage keine Aufgabe vor, die bereits in der Liste offener Aufgaben existiert.",
    "- Enthält die Notiz weder Aufgabe noch Termin, gib eine leere suggestions-Liste zurück.",
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

// ── Medien über OpenRouter (Sprachnotiz + Foto-Notiz + Video) ───────

// MiMo-V2.5 (nicht -Pro!) kann Audio- UND Bild-Eingabe und ist deutlich
// günstiger als Gemini 2.5 Flash. Override via Env möglich.
const DEFAULT_TRANSCRIBE_MODEL = "xiaomi/mimo-v2.5";
const DEFAULT_VISION_MODEL = "xiaomi/mimo-v2.5";
// YouTube-URLs versteht via OpenRouter nur Gemini (Provider "Google AI
// Studio"); 3.1 Flash Lite ist der Preis/Leistungs-Sweet-Spot (GA, 1M ctx).
const DEFAULT_VIDEO_MODEL = "google/gemini-3.1-flash-lite";

type TranscribeParams = {
  audioBase64: string;
  format: "wav" | "mp3";
  locale?: Locale;
  env?: Env;
  fetchFn?: typeof fetch;
};

type ExtractImageParams = {
  imageBase64: string;
  locale?: Locale;
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

  const response = await fetchFn(joinUrl(config.baseUrl, "chat/completions"), {
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
    }),
  });

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
  env = process.env,
  fetchFn = fetch,
}: ExtractImageParams): Promise<string> {
  const config = resolveVisionConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }

  const instruction =
    locale === "en"
      ? "Read this photo of a note (sticky note, whiteboard, notebook page) and extract the text it contains as a compact note. Put each task-like item on its own line. Return only the extracted text, without comments."
      : "Lies dieses Foto einer Notiz (Zettel, Whiteboard, Notizbuchseite) und extrahiere den enthaltenen Text als kompakte Notiz. Setze jeden aufgabenähnlichen Punkt in eine eigene Zeile. Gib ausschließlich den extrahierten Text zurück, ohne Kommentare.";

  const response = await fetchFn(joinUrl(config.baseUrl, "chat/completions"), {
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
      max_tokens: 1500,
    }),
  });

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
  fetchFn?: typeof fetch;
};

// Fasst extrahierten Seitentext mit dem Konto-Modell als Notiz zusammen.
export async function summarizeWebText({
  config,
  pageText,
  url,
  title,
  locale = "de",
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
    { maxTokens: 600, json: false },
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

  const response = await fetchFn(joinUrl(config.baseUrl, "chat/completions"), {
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
    }),
  });

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
    { maxTokens: 400, json: false },
    fetchFn,
  );

  const payload = await readJsonResponse(response, config.label);
  return extractProviderText(payload).trim();
}
