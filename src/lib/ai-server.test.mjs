import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL_ID,
} from "./ai-models.ts";
import {
  buildGraphInsightsFromProviderText,
  buildNoteEnhancementFromProviderText,
  callEnhanceProvider,
  enhanceNoteWithProvider,
  extractImageText,
  extractProviderText,
  generateDailyBriefing,
  generateGraphInsights,
  parseProviderJson,
  resolveAiModelConfig,
  resolveTranscriptionConfig,
  resolveVideoConfig,
  resolveVisionConfig,
  summarizeWebText,
  summarizeYouTubeVideo,
  transcribeAudio,
} from "./ai-server.ts";

const GLM_TEST_CONFIG = {
  id: "glm-5-2",
  label: "GLM 5.2",
  provider: "chat-completions",
  apiKey: "secret-key",
  model: "glm-test",
  baseUrl: "https://example.test/v1",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatReply(content) {
  return jsonResponse({ choices: [{ message: { content } }] });
}

function enhancementPayload(overrides = {}) {
  return JSON.stringify({
    title: "Arzttermin Praxis41",
    enhanced: "Morgen um 9 Uhr steht der Arzttermin in der Praxis41 an.",
    tags: ["gesundheit"],
    projectId: null,
    relatedNoteIds: [],
    suggestions: [],
    ...overrides,
  });
}

test("default model is one of the selectable AI models", () => {
  assert.ok(AI_MODEL_OPTIONS.some((option) => option.id === DEFAULT_AI_MODEL_ID));
});

test("missing provider API key returns a clear configuration error", () => {
  const result = resolveAiModelConfig("openai-gpt-5-5", {});

  assert.equal(result.ok, false);
  assert.match(result.error, /OPENAI_API_KEY/);
  assert.match(result.error, /OPENROUTER_API_KEY/);
  assert.match(result.error, /OpenAI GPT-5\.5/);
});

test("openrouter key alone enables every model via chat completions", () => {
  const env = { OPENROUTER_API_KEY: "sk-or-test" };

  for (const option of AI_MODEL_OPTIONS) {
    const result = resolveAiModelConfig(option.id, env);

    assert.equal(result.ok, true, `${option.id} sollte über OpenRouter laufen`);
    assert.equal(result.config.provider, "chat-completions");
    assert.equal(result.config.apiKey, "sk-or-test");
    assert.equal(result.config.baseUrl, "https://openrouter.ai/api/v1");
    assert.match(result.config.model, /^[a-z0-9-]+\//, "OpenRouter-Slug erwartet");
  }
});

test("direct provider key wins over openrouter key", () => {
  const result = resolveAiModelConfig("deepseek-v4-pro", {
    OPENROUTER_API_KEY: "sk-or-test",
    DEEPSEEK_API_KEY: "sk-direct",
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.apiKey, "sk-direct");
  assert.equal(result.config.baseUrl, "https://api.deepseek.com");
  assert.equal(result.config.model, "deepseek-v4-pro");
});

test("openrouter model slug can be overridden per model", () => {
  const result = resolveAiModelConfig("kimi-k2-7", {
    OPENROUTER_API_KEY: "sk-or-test",
    OPENROUTER_KIMI_K2_7_MODEL: "moonshotai/kimi-k2.7-code",
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.model, "moonshotai/kimi-k2.7-code");
});

test("kimi resolves to the k2.6 slug openrouter actually serves", () => {
  // moonshotai/kimi-k2.7 existiert im Katalog nicht mehr (nur -code);
  // mit dem toten Slug schlugen alle Kimi-Aufrufe sofort mit 400 fehl.
  const result = resolveAiModelConfig("kimi-k2-7", {
    OPENROUTER_API_KEY: "sk-or-test",
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.model, "moonshotai/kimi-k2.6");
});

test("provider JSON parsing rejects malformed responses", () => {
  assert.throws(
    () => parseProviderJson("not json"),
    /KI-Antwort konnte nicht als JSON gelesen werden/,
  );
});

test("json wrapped in markdown fences or prose is still parsed", () => {
  assert.deepEqual(parseProviderJson('```json\n{"suggestions":[]}\n```'), {
    suggestions: [],
  });
  assert.deepEqual(
    parseProviderJson('Hier ist das Ergebnis:\n{"suggestions":[]}\nViel Erfolg!'),
    { suggestions: [] },
  );
});

test("a full enhancement payload is normalized into note fields and suggestions", () => {
  const result = buildNoteEnhancementFromProviderText({
    providerText: enhancementPayload({
      tags: ["#Gesundheit", "Arzt ", "gesundheit"],
      projectId: "project-unbekannt",
      relatedNoteIds: ["note-a", "note-self", "note-x"],
      suggestions: [
        {
          kind: "event",
          suggestedTitle: "Arzttermin Praxis41",
          suggestedDescription: "Termin in der Praxis41 wahrnehmen.",
          suggestedProjectId: "project-halluziniert",
          suggestedNewProjectTitle: null,
          confidence: 0.95,
          priority: "medium",
          dueDate: null,
          eventStart: "2026-07-08T09:00",
          eventEnd: null,
          reasoning: "Datum und Uhrzeit sind klar erkennbar.",
          needsReview: false,
        },
        {
          kind: "task",
          suggestedTitle: "Krankenkassenkarte einpacken",
          suggestedDescription: "Vor dem Termin die Karte einstecken.",
          suggestedProjectId: null,
          suggestedNewProjectTitle: "Gesundheit",
          confidence: 0.8,
          priority: "medium",
          dueDate: "2026-07-08",
          eventStart: null,
          eventEnd: null,
          reasoning: "Sinnvolle Vorbereitung für den Termin.",
          needsReview: false,
        },
      ],
    }),
    noteId: "note-self",
    projectIds: ["project-1"],
    otherNoteIds: ["note-a"],
    nowIso: "2026-07-07T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });

  // Notiz-Anreicherung: Tags normalisiert, unbekannte IDs gefiltert.
  assert.equal(result.enhancement.title, "Arzttermin Praxis41");
  assert.deepEqual(result.enhancement.tags, ["gesundheit", "arzt"]);
  assert.equal(result.enhancement.projectId, null);
  assert.deepEqual(result.enhancement.relatedNoteIds, ["note-a"]);

  // Terminvorschlag: eventStart gesetzt, dueDate abgeleitet, Projekt bereinigt.
  const [event, task] = result.suggestions;
  assert.equal(event.kind, "event");
  assert.equal(event.rawNoteId, "note-self");
  assert.equal(event.eventStart, "2026-07-08T09:00");
  assert.equal(event.dueDate, "2026-07-08");
  assert.equal(event.suggestedProjectId, null);
  assert.equal(event.state, "pending");
  assert.equal(task.kind, "task");
  assert.equal(task.eventStart, null);
});

test("project suggestions are normalized without schedule fields", () => {
  const result = buildNoteEnhancementFromProviderText({
    providerText: enhancementPayload({
      projectId: null,
      suggestions: [
        {
          kind: "project",
          suggestedTitle: "Japan-Reise",
          suggestedDescription: "Planung und Ideen rund um die Reise nach Japan.",
          // Halluzinierte Felder dürfen einen Projekt-Vorschlag nicht kippen.
          suggestedProjectId: "project-halluziniert",
          suggestedNewProjectTitle: null,
          confidence: 0.85,
          priority: "medium",
          dueDate: "2026-08-01",
          eventStart: null,
          eventEnd: null,
          reasoning: "Die Notiz sammelt Reiseideen ohne passendes Projekt.",
          needsReview: false,
        },
      ],
    }),
    noteId: "note-self",
    projectIds: ["project-1"],
    otherNoteIds: [],
    nowIso: "2026-07-07T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });

  const [project] = result.suggestions;
  assert.equal(project.kind, "project");
  // Der Titel ist der Projektname und füllt suggestedNewProjectTitle.
  assert.equal(project.suggestedTitle, "Japan-Reise");
  assert.equal(project.suggestedNewProjectTitle, "Japan-Reise");
  assert.equal(project.suggestedProjectId, null);
  assert.equal(project.dueDate, null);
  assert.equal(project.eventStart, null);
  assert.equal(project.eventEnd, null);
  assert.equal(project.state, "pending");
});

test("the enhancement prompt introduces project suggestions in both locales", async () => {
  for (const [locale, marker] of [
    ["de", /kind "project": Passt KEIN aktiviertes Projekt/],
    ["en", /kind "project": if NO enabled project fits/],
  ]) {
    const calls = [];
    await callEnhanceProvider({
      config: GLM_TEST_CONFIG,
      noteId: "note-1",
      content: "Ideensammlung",
      projects: [],
      locale,
      fetchFn: async (url, init) => {
        calls.push(JSON.parse(init.body));
        return chatReply(enhancementPayload());
      },
    });

    const prompt = calls[0].messages[1].content;
    assert.match(prompt, marker);
    assert.match(prompt, /task \| event \| project/);
    // Projekte sind ausdrücklich auch Kategorien für Nicht-Aufgaben.
    assert.match(prompt, locale === "de" ? /Kategorisierungssystem/ : /categorization system/);
  }
});

test("an empty suggestions list is a valid provider answer", () => {
  const result = buildNoteEnhancementFromProviderText({
    providerText: enhancementPayload(),
    noteId: "note-1",
    projectIds: [],
    otherNoteIds: [],
    nowIso: "2026-07-07T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });

  assert.deepEqual(result.suggestions, []);
  assert.equal(result.enhancement.enhanced.length > 0, true);
});

test("prompt contains the provided reference date with weekday", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Angebot bis Freitag fertig machen",
    projects: [],
    today: "2026-06-24",
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(enhancementPayload());
    },
  });

  const prompt = JSON.parse(calls[0].init.body).messages[1].content;
  assert.match(prompt, /Heute ist Mittwoch, 2026-06-24\./);
});

test("english locale produces an english prompt and system message", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Finish the proposal by Friday",
    projects: [],
    today: "2026-06-24",
    locale: "en",
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(enhancementPayload());
    },
  });

  const body = JSON.parse(calls[0].init.body);
  assert.match(body.messages[0].content, /exclusively with JSON/);
  assert.match(body.messages[1].content, /Today is Wednesday, 2026-06-24\./);
  assert.match(body.messages[1].content, /in English/);
});

test("open tasks, tags and note candidates are listed in the prompt", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Milch kaufen",
    projects: [],
    openTasks: [{ title: "Milch kaufen", projectId: "project-1", dueDate: "2026-07-08" }],
    existingTags: ["haushalt"],
    otherNotes: [{ id: "note-a", title: "Einkaufsliste", tags: ["haushalt"] }],
    today: "2026-07-07",
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply(enhancementPayload());
    },
  });

  const prompt = JSON.parse(calls[0].init.body).messages[1].content;
  assert.match(prompt, /Offene Aufgaben/);
  assert.match(prompt, /Milch kaufen/);
  assert.match(prompt, /Vorhandene Tags/);
  assert.match(prompt, /haushalt/);
  assert.match(prompt, /Vorhandene Notizen/);
  assert.match(prompt, /Einkaufsliste/);
  assert.match(prompt, /leere suggestions-Liste/);
});

test("note enhancement requests strict json output via response_format", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Angebot fertig machen",
    projects: [],
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply(enhancementPayload());
    },
  });

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("chat completion providers are called with configured endpoint and bearer key", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Bitte Angebot fertig machen",
    projects: [],
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(enhancementPayload());
    },
  });

  assert.equal(calls[0].url, "https://example.test/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key");
  assert.equal(JSON.parse(calls[0].init.body).model, "glm-test");
});

test("enhanceNoteWithProvider retries once after a malformed answer", async () => {
  let attempt = 0;
  const result = await enhanceNoteWithProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Angebot fertig machen",
    projects: [],
    fetchFn: async () => {
      attempt += 1;
      return chatReply(
        attempt === 1 ? "Tut mir leid, hier kommt Prosa statt JSON." : enhancementPayload(),
      );
    },
  });

  assert.equal(attempt, 2);
  assert.equal(result.enhancement.title, "Arzttermin Praxis41");
});

test("enhanceNoteWithProvider gives up after the second malformed answer", async () => {
  let attempt = 0;
  await assert.rejects(
    () =>
      enhanceNoteWithProvider({
        config: GLM_TEST_CONFIG,
        noteId: "note-1",
        content: "Angebot fertig machen",
        projects: [],
        fetchFn: async () => {
          attempt += 1;
          return chatReply("immer noch kein JSON");
        },
      }),
    /KI-Antwort/,
  );
  assert.equal(attempt, 2);
});

test("enhanceNoteWithProvider does not retry provider HTTP errors", async () => {
  let attempt = 0;
  await assert.rejects(
    () =>
      enhanceNoteWithProvider({
        config: GLM_TEST_CONFIG,
        noteId: "note-1",
        content: "Angebot fertig machen",
        projects: [],
        fetchFn: async () => {
          attempt += 1;
          return jsonResponse({ error: { message: "quota exceeded" } }, 429);
        },
      }),
    /GLM 5\.2 konnte nicht antworten \(429\)/,
  );
  assert.equal(attempt, 1);
});

test("extracts JSON text from OpenAI Responses payloads", () => {
  const text = extractProviderText({
    output: [
      {
        content: [
          {
            type: "output_text",
            text: "{\"suggestions\":[]}",
          },
        ],
      },
    ],
  });

  assert.equal(text, "{\"suggestions\":[]}");
});

test("extracts JSON text from chat completions payloads", () => {
  const text = extractProviderText({
    choices: [
      {
        message: {
          content: "{\"suggestions\":[]}",
        },
      },
    ],
  });

  assert.equal(text, "{\"suggestions\":[]}");
});

test("transcription requires the openrouter key", () => {
  const result = resolveTranscriptionConfig({});

  assert.equal(result.ok, false);
  assert.match(result.error, /OPENROUTER_API_KEY/);
});

test("transcription sends audio to an audio-capable openrouter model", async () => {
  const calls = [];
  const text = await transcribeAudio({
    audioBase64: "QUJD",
    format: "wav",
    locale: "de",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(" Angebot bis Freitag fertig machen ");
    },
  });

  assert.equal(text, "Angebot bis Freitag fertig machen");
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-or-test");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "xiaomi/mimo-v2.5");
  const audioPart = body.messages[0].content.find(
    (part) => part.type === "input_audio",
  );
  assert.equal(audioPart.input_audio.data, "QUJD");
  assert.equal(audioPart.input_audio.format, "wav");
  assert.deepEqual(body.reasoning, { enabled: false });
});

test("transcription model can be overridden via env", async () => {
  const calls = [];
  await transcribeAudio({
    audioBase64: "QUJD",
    format: "wav",
    env: {
      OPENROUTER_API_KEY: "sk-or-test",
      OPENROUTER_TRANSCRIBE_MODEL: "openai/gpt-4o-audio-preview",
    },
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply("ok");
    },
  });

  assert.equal(JSON.parse(calls[0].init.body).model, "openai/gpt-4o-audio-preview");
});

test("photo extraction requires the openrouter key and sends the image", async () => {
  const missing = resolveVisionConfig({});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /OPENROUTER_API_KEY/);

  // Der Default muss ein stabiles Vision-Modell sein — mimo-Provider
  // hingen bei Bild-Anfragen regelmäßig bis ins Timeout.
  const fallback = resolveVisionConfig({ OPENROUTER_API_KEY: "sk-or-test" });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.model, "google/gemini-3.1-flash-lite");

  const calls = [];
  const text = await extractImageText({
    imageBase64: "QUJD",
    locale: "de",
    env: {
      OPENROUTER_API_KEY: "sk-or-test",
      OPENROUTER_VISION_MODEL: "google/gemini-2.5-pro",
    },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(" Einkauf: Milch, Brot ");
    },
  });

  assert.equal(text, "Einkauf: Milch, Brot");
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "google/gemini-2.5-pro");
  const imagePart = body.messages[0].content.find((part) => part.type === "image_url");
  assert.equal(imagePart.image_url.url, "data:image/jpeg;base64,QUJD");
  // Reasoning aus + genug Budget: sonst frisst das "Denken" die max_tokens
  // auf und textreiche Screenshots kommen leer oder abgeschnitten zurück.
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.equal(body.max_tokens, 4000);
});

test("media calls omit the reasoning field for non-openrouter base urls", async () => {
  const calls = [];
  await extractImageText({
    imageBase64: "QUJD",
    env: {
      OPENROUTER_API_KEY: "sk-proxy-test",
      OPENROUTER_BASE_URL: "https://proxy.example.test/v1",
    },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply("ok");
    },
  });

  assert.equal(calls[0].url, "https://proxy.example.test/v1/chat/completions");
  assert.equal(JSON.parse(calls[0].init.body).reasoning, undefined);
});

test("web summaries send capped page text without response_format", async () => {
  const calls = [];
  const text = await summarizeWebText({
    config: GLM_TEST_CONFIG,
    pageText: `Wichtiger Artikel. ${"x".repeat(20000)}`,
    url: "https://example.com/artikel",
    title: "Beispiel-Artikel",
    locale: "de",
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply(" Kompakte Zusammenfassung. ");
    },
  });

  assert.equal(text, "Kompakte Zusammenfassung.");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.response_format, undefined);
  const prompt = body.messages[0].content;
  assert.match(prompt, /Beispiel-Artikel/);
  assert.match(prompt, /https:\/\/example\.com\/artikel/);
  assert.ok(prompt.length < 14000, "Seitentext muss gekappt sein");
});

test("youtube summaries send the video url to gemini via ai studio", async () => {
  const missing = resolveVideoConfig({});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /OPENROUTER_API_KEY/);

  const calls = [];
  const text = await summarizeYouTubeVideo({
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    title: "Me at the zoo",
    author: "jawed",
    locale: "de",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return chatReply(" Zusammenfassung des Videos. ");
    },
  });

  assert.equal(text, "Zusammenfassung des Videos.");
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "google/gemini-3.1-flash-lite");
  assert.deepEqual(body.provider, { order: ["google-ai-studio"] });
  assert.deepEqual(body.reasoning, { enabled: false });
  const videoPart = body.messages[0].content.find((part) => part.type === "video_url");
  assert.equal(videoPart.video_url.url, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
  const textPart = body.messages[0].content.find((part) => part.type === "text");
  assert.match(textPart.text, /Me at the zoo/);
});

test("the youtube video model can be overridden via env", async () => {
  const calls = [];
  await summarizeYouTubeVideo({
    url: "https://youtu.be/jNQXAC9IVRw",
    env: {
      OPENROUTER_API_KEY: "sk-or-test",
      OPENROUTER_VIDEO_MODEL: "google/gemini-3.5-flash",
    },
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply("ok");
    },
  });

  assert.equal(JSON.parse(calls[0].init.body).model, "google/gemini-3.5-flash");
});

test("daily briefing sends tasks as plain-text request without response_format", async () => {
  const calls = [];
  const text = await generateDailyBriefing({
    config: GLM_TEST_CONFIG,
    tasks: [
      {
        title: "Angebot fertigstellen",
        dueDate: "2026-07-07",
        priority: "high",
        project: "Vertrieb",
      },
    ],
    today: "2026-07-07",
    locale: "de",
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply(" Heute steht das Angebot an. ");
    },
  });

  assert.equal(text, "Heute steht das Angebot an.");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.response_format, undefined);
  assert.match(body.messages[1].content, /Heute ist Dienstag, 2026-07-07\./);
  assert.match(body.messages[1].content, /Angebot fertigstellen/);
});

test("provider HTTP errors are surfaced clearly", async () => {
  await assert.rejects(
    () =>
      callEnhanceProvider({
        config: {
          id: "deepseek-v4-flash",
          label: "DeepSeek V4 Flash",
          provider: "chat-completions",
          apiKey: "secret-key",
          model: "deepseek-v4-flash",
          baseUrl: "https://example.test",
        },
        noteId: "note-1",
        content: "Bitte Angebot fertig machen",
        projects: [],
        fetchFn: async () =>
          new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      }),
    /DeepSeek V4 Flash konnte nicht antworten \(429\): quota exceeded/,
  );
});

// ── Wissensnetz-Analyse ─────────────────────────────────────────────

const INSIGHT_NODES = [
  { title: "Tomaten vorziehen", tags: ["garten"], project: "Garten", degree: 2 },
  { title: "Hochbeet planen", tags: ["garten"], project: "Garten", degree: 1 },
  { title: "Steuer 2026", tags: [], project: null, degree: 0 },
];

test("graph insights parse validates summary and tolerates missing lists", () => {
  const insights = buildGraphInsightsFromProviderText(
    JSON.stringify({
      summary: "Ein Garten-lastiges Netz.",
      clusters: ["Garten: Tomaten vorziehen, Hochbeet planen"],
      gaps: ["Steuer 2026 ist unverbunden", "", 42],
    }),
  );

  assert.equal(insights.summary, "Ein Garten-lastiges Netz.");
  assert.equal(insights.clusters.length, 1);
  // Leere Strings und Nicht-Strings fliegen raus, fehlende Listen werden [].
  assert.deepEqual(insights.gaps, ["Steuer 2026 ist unverbunden"]);
  assert.deepEqual(insights.anomalies, []);
  assert.deepEqual(insights.suggestions, []);
});

test("graph insights parse rejects payloads without summary", () => {
  assert.throws(
    () => buildGraphInsightsFromProviderText(JSON.stringify({ clusters: [] })),
    /KI-Antwort/,
  );
});

test("generateGraphInsights sends the graph as JSON and returns the analysis", async () => {
  const requests = [];
  const insights = await generateGraphInsights({
    config: GLM_TEST_CONFIG,
    nodes: INSIGHT_NODES,
    edges: [[0, 1]],
    locale: "de",
    fetchFn: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return chatReply(
        JSON.stringify({
          summary: "Kern ist der Garten.",
          clusters: [],
          anomalies: [],
          gaps: ["Steuer 2026 hängt in der Luft."],
          suggestions: ["Steuer mit einem Projekt verknüpfen."],
        }),
      );
    },
  });

  assert.equal(insights.summary, "Kern ist der Garten.");
  assert.deepEqual(insights.gaps, ["Steuer 2026 hängt in der Luft."]);

  const prompt = requests[0].body.messages.at(-1).content;
  assert.match(prompt, /Wissensnetz/);
  assert.match(prompt, /Tomaten vorziehen/);
  assert.match(prompt, /\[\[0,1\]\]/);
  assert.equal(requests[0].body.response_format.type, "json_object");
});

test("generateGraphInsights retries once on unusable JSON", async () => {
  let calls = 0;
  const insights = await generateGraphInsights({
    config: GLM_TEST_CONFIG,
    nodes: INSIGHT_NODES,
    edges: [],
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) return chatReply("kein json");
      return chatReply(JSON.stringify({ summary: "Zweiter Versuch." }));
    },
  });

  assert.equal(calls, 2);
  assert.equal(insights.summary, "Zweiter Versuch.");
});

// ── Provider-Timeouts ───────────────────────────────────────────────

test("provider calls carry an abort signal and map timeouts to a clear error", async () => {
  let sawSignal = false;

  await assert.rejects(
    () =>
      transcribeAudio({
        audioBase64: "abc",
        format: "wav",
        env: { OPENROUTER_API_KEY: "key" },
        timeoutMs: 50,
        fetchFn: async (url, init) => {
          sawSignal = init.signal instanceof AbortSignal;
          throw new DOMException("The operation timed out", "TimeoutError");
        },
      }),
    /zu lange gedauert/,
  );
  assert.ok(sawSignal, "fetch bekommt ein AbortSignal");
});

test("deep graph insights request a thorough answer with a bigger budget", async () => {
  const bodies = [];
  const longList = Array.from({ length: 20 }, (_, i) => `Cluster ${i + 1}`);
  const insights = await generateGraphInsights({
    config: GLM_TEST_CONFIG,
    nodes: INSIGHT_NODES,
    edges: [[0, 1]],
    locale: "de",
    detail: true,
    fetchFn: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return chatReply(
        JSON.stringify({ summary: "Ausführliche Analyse.", clusters: longList }),
      );
    },
  });

  const prompt = bodies[0].messages.at(-1).content;
  assert.match(prompt, /TIEFENANALYSE/);
  assert.match(prompt, /maximal 12 Einträge/);
  assert.equal(bodies[0].max_tokens, 6000);
  // Die Tiefenanalyse darf längere Listen behalten (12 statt 6) —
  // kappt aber weiterhin gegen Ausreißer.
  assert.equal(insights.clusters.length, 12);
});

test("graph insights disable reasoning and sort providers only for openrouter", async () => {
  const bodies = [];
  const reply = () => chatReply(JSON.stringify({ summary: "Ok." }));
  const run = (baseUrl) =>
    generateGraphInsights({
      config: { ...GLM_TEST_CONFIG, baseUrl },
      nodes: INSIGHT_NODES,
      edges: [],
      fetchFn: async (url, init) => {
        bodies.push(JSON.parse(init.body));
        return reply();
      },
    });

  await run("https://openrouter.ai/api/v1");
  await run("https://example.test/v1");

  assert.deepEqual(bodies[0].reasoning, { enabled: false });
  // Sortierung nach Durchsatz statt Load-Balancing-Roulette über
  // teils degradierte Provider.
  assert.deepEqual(bodies[0].provider, { sort: "throughput" });
  // Genug Antwort-Budget: 1000 Tokens endeten bei großen Netzen mit
  // finish_reason "length" mitten im JSON.
  assert.ok(bodies[0].max_tokens >= 2500);
  assert.equal(bodies[1].reasoning, undefined);
  assert.equal(bodies[1].provider, undefined);
});

test("enhancement prompt demands at least three tags", async () => {
  const calls = [];
  await callEnhanceProvider({
    config: GLM_TEST_CONFIG,
    noteId: "note-1",
    content: "Kurze Notiz",
    projects: [],
    fetchFn: async (url, init) => {
      calls.push(JSON.parse(init.body));
      return chatReply(enhancementPayload());
    },
  });

  const prompt = calls[0].messages[1].content;
  assert.match(prompt, /3 bis 5/);
  assert.match(prompt, /mindestens 3/);
});
