// functions/process-note/src/main.ts
import { Client, Databases, Storage, Users, Query } from "node-appwrite";

// src/lib/ai-models.ts
var AI_MODEL_OPTIONS = [
  { id: "openai-gpt-5-5", label: "OpenAI GPT-5.5" },
  { id: "glm-5-2", label: "GLM 5.2" },
  { id: "kimi-k2-7", label: "Kimi K2.7" },
  { id: "qwen-3-7-plus", label: "Qwen 3.7 Plus" },
  { id: "qwen-3-7-max", label: "Qwen 3.7 Max" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" }
];
var DEFAULT_AI_MODEL_ID = "openai-gpt-5-5";
function isAiModelId(value) {
  return AI_MODEL_OPTIONS.some((option) => option.id === value);
}
function getAiModelLabel(modelId) {
  return AI_MODEL_OPTIONS.find((option) => option.id === modelId)?.label ?? modelId;
}

// src/lib/ai-server.ts
var OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY";
var OPENROUTER_BASE_URL_ENV = "OPENROUTER_BASE_URL";
var DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
var PROVIDER_DEFINITIONS = {
  "openai-gpt-5-5": {
    provider: "openai-responses",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_GPT_5_5_MODEL",
    defaultModel: "gpt-5.5",
    openRouterModelEnv: "OPENROUTER_GPT_5_5_MODEL",
    defaultOpenRouterModel: "openai/gpt-5.5"
  },
  "glm-5-2": {
    provider: "chat-completions",
    keyEnv: "ZAI_API_KEY",
    modelEnv: "ZAI_GLM_5_2_MODEL",
    defaultModel: "glm-5.2",
    baseUrlEnv: "ZAI_BASE_URL",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    openRouterModelEnv: "OPENROUTER_GLM_5_2_MODEL",
    defaultOpenRouterModel: "z-ai/glm-5.2"
  },
  "kimi-k2-7": {
    provider: "chat-completions",
    keyEnv: "MOONSHOT_API_KEY",
    modelEnv: "MOONSHOT_KIMI_K2_7_MODEL",
    defaultModel: "kimi-k2.7",
    baseUrlEnv: "MOONSHOT_BASE_URL",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    openRouterModelEnv: "OPENROUTER_KIMI_K2_7_MODEL",
    defaultOpenRouterModel: "moonshotai/kimi-k2.7"
  },
  "qwen-3-7-plus": {
    provider: "chat-completions",
    keyEnv: "DASHSCOPE_API_KEY",
    modelEnv: "DASHSCOPE_QWEN_3_7_PLUS_MODEL",
    defaultModel: "qwen3.7-plus",
    baseUrlEnv: "DASHSCOPE_BASE_URL",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openRouterModelEnv: "OPENROUTER_QWEN_3_7_PLUS_MODEL",
    defaultOpenRouterModel: "qwen/qwen3.7-plus"
  },
  "qwen-3-7-max": {
    provider: "chat-completions",
    keyEnv: "DASHSCOPE_API_KEY",
    modelEnv: "DASHSCOPE_QWEN_3_7_MAX_MODEL",
    defaultModel: "qwen3.7-max",
    baseUrlEnv: "DASHSCOPE_BASE_URL",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openRouterModelEnv: "OPENROUTER_QWEN_3_7_MAX_MODEL",
    defaultOpenRouterModel: "qwen/qwen3.7-max"
  },
  "minimax-m3": {
    provider: "chat-completions",
    keyEnv: "MINIMAX_API_KEY",
    modelEnv: "MINIMAX_M3_MODEL",
    defaultModel: "MiniMax-M3",
    baseUrlEnv: "MINIMAX_BASE_URL",
    defaultBaseUrl: "https://api.minimax.io/v1",
    openRouterModelEnv: "OPENROUTER_MINIMAX_M3_MODEL",
    defaultOpenRouterModel: "minimax/minimax-m3"
  },
  "deepseek-v4-pro": {
    provider: "chat-completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_V4_PRO_MODEL",
    defaultModel: "deepseek-v4-pro",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    openRouterModelEnv: "OPENROUTER_DEEPSEEK_V4_PRO_MODEL",
    defaultOpenRouterModel: "deepseek/deepseek-v4-pro"
  },
  "deepseek-v4-flash": {
    provider: "chat-completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_V4_FLASH_MODEL",
    defaultModel: "deepseek-v4-flash",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    openRouterModelEnv: "OPENROUTER_DEEPSEEK_V4_FLASH_MODEL",
    defaultOpenRouterModel: "deepseek/deepseek-v4-flash"
  }
};
function resolveAiModelConfig(modelId, env = process.env) {
  if (!isAiModelId(modelId)) {
    return {
      ok: false,
      status: 400,
      error: `Das ausgew\xE4hlte KI-Modell "${modelId}" wird von Rote Agenda nicht unterst\xFCtzt.`
    };
  }
  const definition = PROVIDER_DEFINITIONS[modelId];
  const label = getAiModelLabel(modelId);
  const directKey = env[definition.keyEnv]?.trim();
  if (directKey) {
    const baseUrl = definition.baseUrlEnv ? env[definition.baseUrlEnv]?.trim() || definition.defaultBaseUrl : void 0;
    return {
      ok: true,
      config: {
        id: modelId,
        label,
        provider: definition.provider,
        apiKey: directKey,
        model: env[definition.modelEnv]?.trim() || definition.defaultModel,
        baseUrl
      }
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
        model: env[definition.openRouterModelEnv]?.trim() || definition.defaultOpenRouterModel,
        baseUrl: env[OPENROUTER_BASE_URL_ENV]?.trim() || DEFAULT_OPENROUTER_BASE_URL
      }
    };
  }
  return {
    ok: false,
    status: 503,
    error: `${label} ist nicht konfiguriert. Setze entweder ${OPENROUTER_KEY_ENV} (ein Key f\xFCr alle Modelle) oder ${definition.keyEnv} (direkter Anbieter) in Appwrite/Next.`
  };
}
function parseProviderJson(value) {
  const attempts = [value];
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
    }
  }
  throw new Error("KI-Antwort konnte nicht als JSON gelesen werden.");
}
function extractProviderText(payload) {
  if (!isRecord(payload)) {
    throw new Error("KI-Anbieter hat keine g\xFCltige Antwort zur\xFCckgegeben.");
  }
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const responseText = extractResponsesText(payload);
  if (responseText) return responseText;
  const chatText = extractChatCompletionsText(payload);
  if (chatText) return chatText;
  throw new Error("KI-Anbieter hat keinen Textinhalt zur\xFCckgegeben.");
}
var DEFAULT_PROVIDER_TIMEOUT_MS = 25e3;
function mapTimeoutError(error) {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new Error(
      "Die KI-Antwort hat zu lange gedauert. Bitte versuche es erneut \u2014 bei Fotos hilft ein kleinerer Ausschnitt, bei Videos ein k\xFCrzeres Video."
    );
  }
  return error;
}
async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw mapTimeoutError(error);
  }
}
async function requestProvider(config, messages, options, fetchFn) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (config.provider === "openai-responses") {
    const input = messages.system ? `${messages.system}

${messages.user}` : messages.user;
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
              content: input
            }
          ],
          max_output_tokens: options.maxTokens,
          ...options.json ? { text: { format: { type: "json_object" } } } : {}
        })
      },
      timeoutMs
    );
  }
  if (!config.baseUrl) {
    throw new Error(`${config.label} ist ohne Base URL konfiguriert.`);
  }
  const chatMessages = [];
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
        ...options.json ? { response_format: { type: "json_object" } } : {},
        ...options.noReasoning && config.baseUrl.includes("openrouter") ? { reasoning: { enabled: false } } : {}
      })
    },
    timeoutMs
  );
}
async function callEnhanceProvider({
  config,
  content,
  projects,
  openTasks = [],
  existingTags = [],
  otherNotes = [],
  today,
  locale = "de",
  timeoutMs,
  fetchFn = fetch
}) {
  const prompt = buildEnhancePrompt(
    content,
    projects,
    openTasks,
    existingTags,
    otherNotes,
    today,
    locale
  );
  const system = locale === "en" ? "You refine raw notes into structured notes, tags, links, tasks and events. You respond exclusively with JSON." : "Du veredelst Rohnotizen zu strukturierten Notizen, Tags, Verkn\xFCpfungen, Aufgaben und Terminen. Du antwortest ausschlie\xDFlich mit JSON.";
  const response = await requestProvider(
    config,
    { system, user: prompt },
    { maxTokens: 2400, json: true, timeoutMs },
    fetchFn
  );
  const payload = await readJsonResponse(response, config.label);
  return extractProviderText(payload);
}
async function enhanceNoteWithProvider(params) {
  const projectIds = params.projects.filter((project) => project.aiEnabled).map((project) => project.id);
  const otherNoteIds = (params.otherNotes ?? []).map((note) => note.id);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const providerText = await callEnhanceProvider(params);
      return buildNoteEnhancementFromProviderText({
        providerText,
        noteId: params.noteId,
        projectIds,
        otherNoteIds
      });
    } catch (error) {
      lastError = error;
      const retryable = error instanceof Error && error.message.startsWith("KI-Antwort");
      if (!retryable) throw error;
    }
  }
  throw lastError;
}
var MAX_TAGS = 6;
var MAX_RELATED_NOTES = 8;
function buildNoteEnhancementFromProviderText({
  providerText,
  noteId,
  projectIds,
  otherNoteIds,
  nowIso = (/* @__PURE__ */ new Date()).toISOString(),
  idFactory = createId
}) {
  const payload = parseProviderJson(providerText);
  if (!isRecord(payload)) {
    throw new Error("KI-Antwort enth\xE4lt kein g\xFCltiges Objekt.");
  }
  const knownProjects = new Set(projectIds);
  const knownNotes = new Set(otherNoteIds);
  const suggestionsPayload = readSuggestionsPayload(payload);
  const enhancement = {
    title: readRequiredString(payload.title, "title").slice(0, 120),
    enhanced: readRequiredString(payload.enhanced, "enhanced"),
    tags: readTags(payload.tags),
    projectId: readKnownId(payload.projectId, knownProjects),
    relatedNoteIds: readRelatedNoteIds(payload.relatedNoteIds, knownNotes, noteId)
  };
  const suggestions = suggestionsPayload.map((suggestion, index) => {
    const normalized = normalizeSuggestion(
      suggestion,
      noteId,
      nowIso,
      idFactory(`suggestion-${index}`)
    );
    if (normalized.suggestedProjectId && !knownProjects.has(normalized.suggestedProjectId)) {
      return { ...normalized, suggestedProjectId: null };
    }
    return normalized;
  });
  return { enhancement, suggestions };
}
function readTags(value) {
  if (!Array.isArray(value)) {
    throw new Error('KI-Antwort enth\xE4lt kein g\xFCltiges Feld "tags".');
  }
  const tags = value.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);
  return Array.from(new Set(tags)).slice(0, MAX_TAGS);
}
function readKnownId(value, known) {
  if (typeof value !== "string") return null;
  return known.has(value) ? value : null;
}
function readRelatedNoteIds(value, known, selfId) {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id) => typeof id === "string").filter((id) => id !== selfId && known.has(id));
  return Array.from(new Set(ids)).slice(0, MAX_RELATED_NOTES);
}
function readSuggestionsPayload(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.suggestions)) {
    throw new Error("KI-Antwort enth\xE4lt keine g\xFCltige suggestions-Liste.");
  }
  return payload.suggestions.map((item) => {
    if (!isRecord(item)) {
      throw new Error("KI-Antwort enth\xE4lt einen ung\xFCltigen Vorschlag.");
    }
    return item;
  });
}
function normalizeSuggestion(value, rawNoteId, createdAt, id) {
  const priority = readPriority(value.priority);
  const confidence = readConfidence(value.confidence);
  const kind = value.kind === "event" ? "event" : "task";
  let dueDate = readNullableDate(value.dueDate);
  let eventStart = null;
  let eventEnd = null;
  if (kind === "event") {
    eventStart = readEventTime(value.eventStart, "eventStart");
    eventEnd = value.eventEnd === null || value.eventEnd === void 0 ? null : readEventTime(value.eventEnd, "eventEnd");
    dueDate = dueDate ?? eventStart.slice(0, 10);
  }
  return {
    id,
    rawNoteId,
    kind,
    suggestedTitle: readRequiredString(value.suggestedTitle, "suggestedTitle"),
    suggestedDescription: readRequiredString(
      value.suggestedDescription,
      "suggestedDescription"
    ),
    suggestedProjectId: readNullableString(value.suggestedProjectId, "suggestedProjectId"),
    suggestedNewProjectTitle: readNullableString(
      value.suggestedNewProjectTitle,
      "suggestedNewProjectTitle"
    ),
    confidence,
    priority,
    dueDate,
    eventStart,
    eventEnd,
    reasoning: readRequiredString(value.reasoning, "reasoning"),
    needsReview: readBoolean(value.needsReview, "needsReview"),
    state: "pending",
    createdAt
  };
}
function readEventTime(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`KI-Antwort enth\xE4lt kein g\xFCltiges Feld "${field}".`);
  }
  return value;
}
function readRequiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`KI-Antwort enth\xE4lt kein g\xFCltiges Feld "${field}".`);
  }
  return value.trim();
}
function readNullableString(value, field) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`KI-Antwort enth\xE4lt kein g\xFCltiges Feld "${field}".`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function readNullableDate(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('KI-Antwort enth\xE4lt kein g\xFCltiges Feld "dueDate".');
  }
  return value;
}
function readBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new Error(`KI-Antwort enth\xE4lt kein g\xFCltiges Feld "${field}".`);
  }
  return value;
}
function readPriority(value) {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error('KI-Antwort enth\xE4lt kein g\xFCltiges Feld "priority".');
}
function readConfidence(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error('KI-Antwort enth\xE4lt kein g\xFCltiges Feld "confidence".');
  }
  return Number(value.toFixed(2));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var WEEKDAY_NAMES = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
};
function describeToday(todayIso, locale) {
  const iso = todayIso && /^\d{4}-\d{2}-\d{2}$/.test(todayIso) ? todayIso : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const weekday = WEEKDAY_NAMES[locale][(/* @__PURE__ */ new Date(`${iso}T12:00:00Z`)).getUTCDay()];
  return `${weekday}, ${iso}`;
}
var JSON_SHAPE = '{"title":"...","enhanced":"...","tags":["tag1","tag2"],"projectId":"project-id | null","relatedNoteIds":["note-id"],"suggestions":[{"kind":"task | event","suggestedTitle":"...","suggestedDescription":"...","suggestedProjectId":"project-id | null","suggestedNewProjectTitle":"... | null","confidence":0.0,"priority":"low|medium|high","dueDate":"YYYY-MM-DD | null","eventStart":"YYYY-MM-DDTHH:MM | null","eventEnd":"YYYY-MM-DDTHH:MM | null","reasoning":"...","needsReview":true}]}';
var MAX_PROMPT_TASKS = 150;
var MAX_PROMPT_TASK_TITLE = 120;
var MAX_PROMPT_NOTES = 250;
var MAX_PROMPT_TAGS = 120;
var MAX_PROMPT_SNIPPET = 160;
function compactOpenTasks(openTasks) {
  return openTasks.slice(0, MAX_PROMPT_TASKS).map((task) => ({
    title: task.title.slice(0, MAX_PROMPT_TASK_TITLE),
    projectId: task.projectId,
    dueDate: task.dueDate
  }));
}
function compactNoteCandidates(notes) {
  return notes.slice(0, MAX_PROMPT_NOTES).map((note) => ({
    id: note.id,
    title: note.title.slice(0, MAX_PROMPT_TASK_TITLE),
    tags: note.tags.slice(0, MAX_TAGS),
    ...note.snippet?.trim() ? { snippet: note.snippet.trim().slice(0, MAX_PROMPT_SNIPPET) } : {}
  }));
}
function buildEnhancePrompt(content, projects, openTasks, existingTags, otherNotes, today, locale) {
  const enabledProjects = projects.filter((project) => project.aiEnabled).map((project) => ({
    id: project.id,
    title: project.title,
    description: project.description,
    keywords: project.keywords
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
      "- tags: 3 to 5 short lowercase keywords \u2014 a single tag almost never captures a note fully, so always assign at least 3. Strongly prefer existing tags when they fit (consistent tags across notes form a knowledge network), but do invent a new precise tag when nothing existing truly matches.",
      "- projectId: the id of the best-fitting enabled project, otherwise null.",
      "- relatedNoteIds: ids of ALL thematically related notes from the candidate list (max 8), otherwise an empty list. These links form a knowledge graph like in Obsidian \u2014 be generous with genuine thematic connections (same topic, person, place or project), but never invent links.",
      "About suggestions (0 to 4 entries):",
      '- kind "task": a concrete actionable task from the note. kind "event": an appointment with a recognizable date; set eventStart as local time YYYY-MM-DDTHH:MM (assume 09:00 if no time is given) and dueDate to the same date.',
      "- For an event, also propose sensible preparation tasks as separate task suggestions (e.g. bring documents).",
      "- Convert relative expressions like today, tomorrow or Friday based on today's date.",
      "- Do not suggest tasks that already exist in the list of open tasks.",
      "- If the note contains neither a task nor an event, return an empty suggestions list.",
      "Write every text in English.",
      ...tags.length ? ["Existing tags:", JSON.stringify(tags)] : [],
      ...noteCandidates.length ? ["Existing notes (id, title, tags, snippet):", JSON.stringify(noteCandidates)] : [],
      ...existingTasks.length ? ["Open tasks (JSON):", JSON.stringify(existingTasks)] : [],
      "Enabled projects:",
      JSON.stringify(enabledProjects),
      "Raw note:",
      content
    ].join("\n");
  }
  return [
    "Du bist die strukturierende KI der Notiz-App Rote Agenda.",
    `Heute ist ${describeToday(today, "de")}.`,
    "Du bekommst eine Rohnotiz. Antworte ausschlie\xDFlich mit g\xFCltigem JSON in dieser Form:",
    JSON_SHAPE,
    "Zur Notiz selbst:",
    "- title: eine pr\xE4gnante \xDCberschrift (maximal 60 Zeichen).",
    "- enhanced: die Notiz sauber ausformuliert und gut strukturiert. Inhalt bewahren, nichts dazuerfinden. Reiner Text mit Abs\xE4tzen und einfachen Spiegelstrichen, keine Markdown-Syntax.",
    "- tags: 3 bis 5 kurze, kleingeschriebene Schlagw\xF6rter \u2014 ein einzelnes Tag greift fast immer zu kurz, vergib deshalb immer mindestens 3. Nutze bevorzugt vorhandene Tags, wenn sie passen (konsistente Tags \xFCber alle Notizen bilden ein Wissensnetz), aber erfinde ruhig ein treffendes neues, wenn keines wirklich passt.",
    "- projectId: die ID des am besten passenden aktivierten Projekts, sonst null.",
    "- relatedNoteIds: IDs ALLER thematisch verwandten Notizen aus der Kandidatenliste (maximal 8), sonst leere Liste. Diese Verkn\xFCpfungen bilden ein Wissensnetz wie in Obsidian \u2014 sei gro\xDFz\xFCgig bei echten thematischen Bez\xFCgen (gleiches Thema, Person, Ort oder Projekt), aber erfinde keine.",
    "Zu den Vorschl\xE4gen (suggestions, 0 bis 4 Eintr\xE4ge):",
    '- kind "task": eine konkrete Aufgabe aus der Notiz. kind "event": ein Termin mit erkennbarem Datum; setze eventStart als lokale Zeit YYYY-MM-DDTHH:MM (ohne erkennbare Uhrzeit 09:00 annehmen) und dueDate auf dasselbe Datum.',
    "- Zu einem Termin geh\xF6ren sinnvolle Vorbereitungs-Aufgaben als eigene task-Vorschl\xE4ge (z. B. Unterlagen mitnehmen).",
    "- Rechne relative Angaben wie heute, morgen oder Freitag vom heutigen Datum aus um.",
    "- Schlage keine Aufgabe vor, die bereits in der Liste offener Aufgaben existiert.",
    "- Enth\xE4lt die Notiz weder Aufgabe noch Termin, gib eine leere suggestions-Liste zur\xFCck.",
    "Formuliere alle Texte auf Deutsch.",
    ...tags.length ? ["Vorhandene Tags:", JSON.stringify(tags)] : [],
    ...noteCandidates.length ? ["Vorhandene Notizen (id, title, tags, snippet):", JSON.stringify(noteCandidates)] : [],
    ...existingTasks.length ? ["Offene Aufgaben (JSON):", JSON.stringify(existingTasks)] : [],
    "Aktivierte Projekte:",
    JSON.stringify(enabledProjects),
    "Rohnotiz:",
    content
  ].join("\n");
}
function providerHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}
async function readJsonResponse(response, providerLabel) {
  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw mapTimeoutError(error);
  }
  if (!response.ok) {
    throw new Error(
      `${providerLabel} konnte nicht antworten (${response.status}): ${readProviderError(text)}`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${providerLabel} hat keine g\xFCltige JSON-HTTP-Antwort geliefert.`);
  }
}
function readProviderError(text) {
  if (!text.trim()) return "Keine Details vom Anbieter erhalten.";
  try {
    const payload = JSON.parse(text);
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
function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function extractResponsesText(payload) {
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
function extractChatCompletionsText(payload) {
  if (!Array.isArray(payload.choices)) return null;
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
  const content = firstChoice.message.content;
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content.flatMap((part) => {
    if (!isRecord(part)) return [];
    if (typeof part.text === "string") return [part.text];
    return [];
  }).join("").trim();
  return text || null;
}
function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var DEFAULT_VISION_MODEL = "google/gemini-3.1-flash-lite";
var DEFAULT_VIDEO_MODEL = "google/gemini-3.1-flash-lite";
function resolveOpenRouterMedia(env, modelEnvName, defaultModel, purpose) {
  const apiKey = env[OPENROUTER_KEY_ENV]?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: `${purpose} ben\xF6tigt ${OPENROUTER_KEY_ENV}. Bitte setze die Environment Variable in Appwrite/Next.`
    };
  }
  return {
    ok: true,
    apiKey,
    model: env[modelEnvName]?.trim() || defaultModel,
    baseUrl: env[OPENROUTER_BASE_URL_ENV]?.trim() || DEFAULT_OPENROUTER_BASE_URL
  };
}
function resolveVisionConfig(env = process.env) {
  return resolveOpenRouterMedia(
    env,
    "OPENROUTER_VISION_MODEL",
    DEFAULT_VISION_MODEL,
    "Die Foto-Erkennung"
  );
}
function resolveVideoConfig(env = process.env) {
  return resolveOpenRouterMedia(
    env,
    "OPENROUTER_VIDEO_MODEL",
    DEFAULT_VIDEO_MODEL,
    "Die Video-Analyse"
  );
}
async function extractImageText({
  imageBase64,
  locale = "de",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  env = process.env,
  fetchFn = fetch
}) {
  const config = resolveVisionConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }
  const instruction = locale === "en" ? "Read this image (photo of a sticky note, whiteboard, notebook page, or a screenshot) and extract the text it contains as a compact note. Put each task-like item on its own line. Return only the extracted text, without comments." : "Lies dieses Bild (Foto eines Zettels, Whiteboards, einer Notizbuchseite oder ein Screenshot) und extrahiere den enthaltenen Text als kompakte Notiz. Setze jeden aufgaben\xE4hnlichen Punkt in eine eigene Zeile. Gib ausschlie\xDFlich den extrahierten Text zur\xFCck, ohne Kommentare.";
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
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
              }
            ]
          }
        ],
        // Textreiche Screenshots brauchen Luft — und ohne abgeschaltetes
        // Reasoning zählt sonst das "Denken" mit ins Budget, bis kein
        // sichtbarer Text mehr übrig bleibt ("kein Text erkannt").
        max_tokens: 4e3,
        ...config.baseUrl.includes("openrouter") ? { reasoning: { enabled: false } } : {}
      })
    },
    timeoutMs
  );
  const payload = await readJsonResponse(response, "Foto-Erkennung");
  const text = extractProviderText(payload).trim();
  if (!text) {
    throw new Error("Auf dem Foto wurde kein Text erkannt.");
  }
  return text;
}
var MAX_PAGE_TEXT = 12e3;
async function summarizeWebText({
  config,
  pageText,
  url,
  title,
  locale = "de",
  timeoutMs,
  fetchFn = fetch
}) {
  const text = pageText.slice(0, MAX_PAGE_TEXT);
  const prompt = locale === "en" ? [
    "Summarize this web page as a compact note (at most ~180 words):",
    "key statements, important facts, and explicitly mention any tasks, dates or deadlines that appear.",
    "Plain text with paragraphs or simple dashes, no markdown syntax, no preamble.",
    `Respond in English.`,
    title ? `Page title: ${title}` : "",
    `URL: ${url}`,
    "Page text (possibly truncated):",
    text
  ] : [
    "Fasse diese Webseite als kompakte Notiz zusammen (maximal ~180 W\xF6rter):",
    "Kernaussagen, wichtige Fakten, und nenne explizit alle erw\xE4hnten Aufgaben, Termine oder Fristen.",
    "Reiner Text mit Abs\xE4tzen oder einfachen Spiegelstrichen, keine Markdown-Syntax, keine Vorrede.",
    "Antworte auf Deutsch.",
    title ? `Seitentitel: ${title}` : "",
    `URL: ${url}`,
    "Seitentext (ggf. gek\xFCrzt):",
    text
  ];
  const response = await requestProvider(
    config,
    { user: prompt.filter(Boolean).join("\n") },
    { maxTokens: 600, json: false, timeoutMs },
    fetchFn
  );
  const payload = await readJsonResponse(response, config.label);
  const summary = extractProviderText(payload).trim();
  if (!summary) {
    throw new Error("Die Zusammenfassung hat keinen Text geliefert.");
  }
  return summary;
}
async function summarizeYouTubeVideo({
  url,
  title,
  author,
  locale = "de",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  env = process.env,
  fetchFn = fetch
}) {
  const config = resolveVideoConfig(env);
  if (!config.ok) {
    throw new Error(config.error);
  }
  const context = [title, author ? `(${author})` : ""].filter(Boolean).join(" ");
  const instruction = locale === "en" ? [
    "Watch this video and summarize it as a compact note (at most ~200 words):",
    "core statements, structure/chapters, and explicitly mention any tasks, dates or recommendations.",
    "Plain text, no markdown syntax, no preamble. Respond in English.",
    context ? `Video: ${context}` : ""
  ] : [
    "Sieh dir dieses Video an und fasse es als kompakte Notiz zusammen (maximal ~200 W\xF6rter):",
    "Kernaussagen, Struktur/Kapitel, und nenne explizit erw\xE4hnte Aufgaben, Termine oder Empfehlungen.",
    "Reiner Text, keine Markdown-Syntax, keine Vorrede. Antworte auf Deutsch.",
    context ? `Video: ${context}` : ""
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
              { type: "video_url", video_url: { url } }
            ]
          }
        ],
        max_tokens: 800,
        // Vertex akzeptiert keine Video-URLs — AI Studio bevorzugen.
        provider: { order: ["google-ai-studio"] },
        ...config.baseUrl.includes("openrouter") ? { reasoning: { enabled: false } } : {}
      })
    },
    timeoutMs
  );
  const payload = await readJsonResponse(response, "Video-Analyse");
  const summary = extractProviderText(payload).trim();
  if (!summary) {
    throw new Error("Die Video-Analyse hat keinen Inhalt geliefert.");
  }
  return summary;
}

// src/lib/web-content.ts
import { lookup as dnsLookup } from "node:dns/promises";
var DEFAULT_LOOKUP = (hostname) => dnsLookup(hostname, { all: true });
var MAX_REDIRECTS = 3;
var DEFAULT_TIMEOUT_MS = 1e4;
var DEFAULT_MAX_BYTES = 15e5;
function isPrivateIp(ip) {
  const value = ip.toLowerCase();
  if (value.includes(":")) {
    if (value === "::1" || value === "::") return true;
    if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
    if (value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("::ffff:")) return isPrivateIp(value.slice(7));
    return false;
  }
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
async function assertPublicHttpUrl(rawUrl, lookup = DEFAULT_LOOKUP) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Die URL ist ung\xFCltig.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http- und https-Links werden unterst\xFCtzt.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Links mit ungew\xF6hnlichen Ports werden nicht unterst\xFCtzt.");
  }
  if (url.username || url.password) {
    throw new Error("Links mit Zugangsdaten werden nicht unterst\xFCtzt.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Lokale Adressen werden nicht unterst\xFCtzt.");
  }
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(bareHost) || bareHost.includes(":")) {
    if (isPrivateIp(bareHost)) {
      throw new Error("Private Adressen werden nicht unterst\xFCtzt.");
    }
    return url;
  }
  let addresses;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new Error("Der Host der URL konnte nicht aufgel\xF6st werden.");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Private Adressen werden nicht unterst\xFCtzt.");
  }
  return url;
}
async function fetchPublicPage(rawUrl, {
  fetchFn = fetch,
  lookup = DEFAULT_LOOKUP,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicHttpUrl(currentUrl, lookup);
    const response = await fetchFn(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoteAgenda/1.0)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "Accept-Language": "de,en;q=0.8"
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Die Seite leitet ohne Ziel weiter.");
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Die Seite konnte nicht geladen werden (HTTP ${response.status}).`);
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Nur HTML- und Textseiten k\xF6nnen zusammengefasst werden.");
    }
    return {
      finalUrl: url.toString(),
      contentType,
      body: await readBodyCapped(response, maxBytes)
    };
  }
  throw new Error("Die Seite leitet zu oft weiter.");
}
async function readBodyCapped(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, maxBytes);
  }
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  void reader.cancel().catch(() => void 0);
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= merged.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}
function extractHtmlTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 120) : null;
}
function htmlToText(html) {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
  ).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function decodeEntities(text) {
  return text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
function parseYouTubeVideoId(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] || null;
  } else if (host === "youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
      id = url.pathname.split("/")[2] || null;
    }
  }
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}
async function fetchYouTubeOEmbed(videoUrl, fetchFn = fetch) {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetchFn(endpoint, {
      signal: AbortSignal.timeout(6e3),
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const title = typeof payload.title === "string" ? payload.title : "";
    const author = typeof payload.author_name === "string" ? payload.author_name : "";
    return title || author ? { title, author } : null;
  } catch {
    return null;
  }
}

// functions/process-note/src/main.ts
var DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "roteagenda";
var NOTES_ID = process.env.APPWRITE_RAW_NOTES_COLLECTION_ID || "rawNotes";
var SUGGESTIONS_ID = process.env.APPWRITE_SUGGESTIONS_COLLECTION_ID || "suggestions";
var PROJECTS_ID = process.env.APPWRITE_PROJECTS_COLLECTION_ID || "projects";
var TASKS_ID = process.env.APPWRITE_TASKS_COLLECTION_ID || "tasks";
var BUCKET_ID = process.env.APPWRITE_MEDIA_BUCKET_ID || "noteMedia";
var main_default = async ({ req, res, log, error }) => {
  const doc = readDocument(req);
  if (!doc || typeof doc.$id !== "string") {
    return res.json({ skipped: "kein Dokument im Event" });
  }
  const client = new Client().setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT ?? "").setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID ?? "").setKey(req.headers["x-appwrite-key"] ?? "");
  const databases = new Databases(client);
  const storage = new Storage(client);
  const users = new Users(client);
  const eventName = req.headers["x-appwrite-event"] ?? "";
  if (eventName.endsWith(".delete")) {
    await cleanupFile(storage, doc);
    return res.json({ skipped: "delete-event" });
  }
  if (doc.processed === true) {
    return res.json({ skipped: "bereits verarbeitet" });
  }
  if (typeof doc.processingError === "string" && doc.processingError) {
    return res.json({ skipped: "bereits fehlgeschlagen" });
  }
  const source = doc.source;
  if (source !== "url" && source !== "image") {
    return res.json({ skipped: `source=${String(source)}` });
  }
  if (typeof doc.createdAt === "string" && typeof doc.updatedAt === "string" && doc.updatedAt !== doc.createdAt) {
    return res.json({ skipped: "bereits angefasst" });
  }
  const noteId = doc.$id;
  const now = () => (/* @__PURE__ */ new Date()).toISOString();
  try {
    const userId = extractUserId(doc.$permissions);
    const prefs = userId ? await users.getPrefs(userId).catch(() => ({})) : {};
    const aiModel = typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel) ? prefs.aiModel : DEFAULT_AI_MODEL_ID;
    const locale = prefs.locale === "en" ? "en" : "de";
    let content = "";
    let sourceTitle = "";
    if (source === "url") {
      const sourceUrl = String(doc.sourceUrl ?? "");
      if (!sourceUrl) throw new Error("Zur Link-Notiz fehlt die URL.");
      log(`Analysiere URL: ${sourceUrl}`);
      const result = await buildUrlContent(sourceUrl, aiModel, locale);
      content = result.content;
      sourceTitle = result.title;
    } else {
      const fileId = typeof doc.pendingFileId === "string" ? doc.pendingFileId : "";
      if (!fileId) throw new Error("Zur Foto-Notiz fehlt die hochgeladene Datei.");
      log(`Lese Foto ${fileId}`);
      const bytes = await storage.getFileDownload(BUCKET_ID, fileId);
      const imageBase64 = Buffer.from(bytes).toString("base64");
      content = await extractImageText({ imageBase64, locale, timeoutMs: OCR_TIMEOUT_MS });
    }
    const resolved = resolveAiModelConfig(aiModel);
    if (!resolved.ok) {
      await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
        content: content.slice(0, 8e3),
        title: sourceTitle.slice(0, 250),
        pendingFileId: null,
        processingError: resolved.error.slice(0, 1e3),
        updatedAt: now()
      });
      return res.json({ ok: false, stored: true, reason: "kein KI-Key" });
    }
    const marker = userId ? `user:${userId}` : null;
    const [projects, tasks, notes] = await Promise.all([
      listUserDocuments(databases, PROJECTS_ID, marker),
      listUserDocuments(databases, TASKS_ID, marker),
      listUserDocuments(databases, NOTES_ID, marker)
    ]);
    const enhancementResult = await enhanceNoteWithProvider({
      config: resolved.config,
      noteId: String(doc.id ?? noteId),
      timeoutMs: ENHANCE_TIMEOUT_MS,
      content,
      projects: projects.map((project) => ({
        id: String(project.id ?? project.$id),
        title: String(project.title ?? ""),
        description: String(project.description ?? ""),
        keywords: Array.isArray(project.keywords) ? project.keywords : [],
        aiEnabled: project.aiEnabled !== false
      })),
      openTasks: tasks.filter((task) => task.status !== "done").slice(0, 150).map((task) => ({
        title: String(task.title ?? ""),
        projectId: typeof task.projectId === "string" ? task.projectId : null,
        dueDate: typeof task.dueDate === "string" ? task.dueDate : null
      })),
      existingTags: Array.from(
        new Set(notes.flatMap((note) => Array.isArray(note.tags) ? note.tags : []))
      ).slice(0, 120),
      // Alle Notizen als Verlinkungs-Kandidaten (bis zur Prompt-Grenze),
      // mit Inhalts-Snippet — identisch zur App-seitigen Veredelung.
      otherNotes: notes.filter((note) => note.$id !== noteId).slice(0, 250).map((note) => ({
        id: String(note.id ?? note.$id),
        title: String(note.title || String(note.content ?? "").slice(0, 60)),
        tags: Array.isArray(note.tags) ? note.tags : [],
        snippet: String(note.enhanced || note.content || "").slice(0, 200)
      })),
      locale
    });
    const { enhancement, suggestions } = enhancementResult;
    await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
      content: content.slice(0, 8e3),
      title: (enhancement.title || sourceTitle).slice(0, 250),
      enhanced: enhancement.enhanced.slice(0, 19e3),
      tags: enhancement.tags,
      projectId: enhancement.projectId ?? doc.projectId ?? null,
      relatedNoteIds: enhancement.relatedNoteIds,
      processed: true,
      pendingFileId: null,
      processingError: null,
      updatedAt: now()
    });
    for (const suggestion of suggestions) {
      try {
        await databases.createDocument(
          DATABASE_ID,
          SUGGESTIONS_ID,
          suggestion.id,
          toDocumentData(suggestion),
          doc.$permissions ?? []
        );
      } catch (suggestionError) {
        error(`Vorschlag konnte nicht gespeichert werden: ${String(suggestionError)}`);
      }
    }
    log(`Fertig: ${suggestions.length} Vorschl\xE4ge`);
    return res.json({ ok: true, suggestions: suggestions.length });
  } catch (workerError) {
    const message = workerError instanceof Error && workerError.message ? workerError.message : "Unbekannter Fehler bei der Analyse.";
    error(message);
    try {
      await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
        processingError: message.slice(0, 1e3),
        pendingFileId: null,
        updatedAt: now()
      });
    } catch (updateError) {
      error(`Fehlerstatus konnte nicht gespeichert werden: ${String(updateError)}`);
    }
    return res.json({ ok: false, error: message });
  }
};
function readDocument(req) {
  const candidate = req.bodyJson ?? req.body;
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}
function extractUserId(permissions) {
  for (const permission of permissions ?? []) {
    const match = permission.match(/user:([A-Za-z0-9_.-]+)/);
    if (match) return match[1];
  }
  return null;
}
async function listUserDocuments(databases, collectionId, marker) {
  const documents = [];
  let cursor = null;
  while (documents.length < 5e3) {
    const queries = [Query.limit(100), Query.orderDesc("$createdAt")];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DATABASE_ID, collectionId, queries);
    for (const document of page.documents) {
      const permissions = document.$permissions ?? [];
      if (!marker || permissions.some((permission) => permission.includes(marker))) {
        documents.push(document);
      }
    }
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return documents;
}
var VIDEO_TIMEOUT_MS = 2e5;
var SUMMARY_TIMEOUT_MS = 6e4;
var ENHANCE_TIMEOUT_MS = 9e4;
var OCR_TIMEOUT_MS = 12e4;
async function buildUrlContent(sourceUrl, aiModel, locale) {
  if (parseYouTubeVideoId(sourceUrl)) {
    const meta = await fetchYouTubeOEmbed(sourceUrl);
    try {
      const content2 = await summarizeYouTubeVideo({
        url: sourceUrl,
        title: meta?.title,
        author: meta?.author,
        locale,
        timeoutMs: VIDEO_TIMEOUT_MS
      });
      return { content: content2, title: meta?.title ?? "" };
    } catch (videoError) {
      if (!meta) throw videoError;
      const detail = videoError instanceof Error && videoError.message ? ` (${videoError.message})` : "";
      const header = [meta.title, meta.author ? `\u2014 ${meta.author}` : ""].filter(Boolean).join(" ");
      const content2 = locale === "en" ? `YouTube video: ${header}
${sourceUrl}

Automatic video analysis was not possible${detail}.` : `YouTube-Video: ${header}
${sourceUrl}

Die automatische Video-Analyse war nicht m\xF6glich${detail}.`;
      return { content: content2, title: meta.title ?? "" };
    }
  }
  const resolved = resolveAiModelConfig(aiModel);
  if (!resolved.ok) throw new Error(resolved.error);
  const page = await fetchPublicPage(sourceUrl);
  const isHtml = page.contentType.includes("text/html");
  const title = isHtml ? extractHtmlTitle(page.body) : null;
  const pageText = isHtml ? htmlToText(page.body) : page.body;
  if (!pageText.trim()) {
    throw new Error("Auf der Seite wurde kein lesbarer Text gefunden.");
  }
  const content = await summarizeWebText({
    config: resolved.config,
    pageText,
    url: page.finalUrl,
    title,
    locale,
    timeoutMs: SUMMARY_TIMEOUT_MS
  });
  return { content, title: title ?? "" };
}
async function cleanupFile(storage, doc) {
  const fileId = typeof doc.mediaFileId === "string" && doc.mediaFileId ? doc.mediaFileId : typeof doc.pendingFileId === "string" ? doc.pendingFileId : "";
  if (!fileId) return;
  try {
    await storage.deleteFile(BUCKET_ID, fileId);
  } catch {
  }
}
function toDocumentData(item) {
  return Object.fromEntries(
    Object.entries(item).filter(([key, value]) => !key.startsWith("$") && value !== null)
  );
}
export {
  main_default as default
};
