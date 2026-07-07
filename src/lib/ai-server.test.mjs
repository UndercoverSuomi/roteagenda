import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL_ID,
} from "./ai-models.ts";
import {
  buildProcessingResultFromProviderText,
  callAiProvider,
  extractImageText,
  extractProviderText,
  generateDailyBriefing,
  parseProviderJson,
  processNoteWithProvider,
  resolveAiModelConfig,
  resolveTranscriptionConfig,
  resolveVisionConfig,
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

test("provider JSON parsing rejects malformed responses", () => {
  assert.throws(
    () => parseProviderJson("not json"),
    /KI-Antwort konnte nicht als JSON gelesen werden/,
  );
});

test("provider JSON is converted into app suggestions", () => {
  const result = buildProcessingResultFromProviderText({
    note: "Chef meinte Angebot bis Freitag fertig machen",
    nowIso: "2026-06-24T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
    providerText: JSON.stringify({
      suggestions: [
        {
          suggestedTitle: "Angebot fertigstellen",
          suggestedDescription: "Angebot fuer den Kunden finalisieren.",
          suggestedProjectId: "project-marketing",
          suggestedNewProjectTitle: null,
          confidence: 0.88,
          priority: "high",
          dueDate: "2026-06-26",
          reasoning: "Kunde, Angebot und Deadline deuten auf Marketing.",
          needsReview: false,
        },
      ],
    }),
  });

  assert.equal(result.rawNote.id, "note-fixed");
  assert.equal(result.rawNote.content, "Chef meinte Angebot bis Freitag fertig machen");
  assert.equal(result.rawNote.processed, true);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].id, "suggestion-0-fixed");
  assert.equal(result.suggestions[0].rawNoteId, "note-fixed");
  assert.equal(result.suggestions[0].state, "pending");
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

test("prompt contains the provided reference date with weekday", async () => {
  const calls = [];
  await callAiProvider({
    config: {
      id: "glm-5-2",
      label: "GLM 5.2",
      provider: "chat-completions",
      apiKey: "secret-key",
      model: "glm-test",
      baseUrl: "https://example.test/v1",
    },
    note: "Angebot bis Freitag fertig machen",
    projects: [],
    today: "2026-06-24",
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"suggestions\":[]}" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const prompt = JSON.parse(calls[0].init.body).messages[1].content;
  assert.match(prompt, /Heute ist Mittwoch, 2026-06-24\./);
});

test("english locale produces an english prompt and system message", async () => {
  const calls = [];
  await callAiProvider({
    config: {
      id: "glm-5-2",
      label: "GLM 5.2",
      provider: "chat-completions",
      apiKey: "secret-key",
      model: "glm-test",
      baseUrl: "https://example.test/v1",
    },
    note: "Finish the proposal by Friday",
    projects: [],
    today: "2026-06-24",
    locale: "en",
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"suggestions\":[]}" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const body = JSON.parse(calls[0].init.body);
  assert.match(body.messages[0].content, /respond exclusively with JSON/);
  assert.match(body.messages[1].content, /Today is Wednesday, 2026-06-24\./);
  assert.match(body.messages[1].content, /in English/);
});

test("chat completion providers are called with configured endpoint and bearer key", async () => {
  const calls = [];
  const text = await callAiProvider({
    config: {
      id: "glm-5-2",
      label: "GLM 5.2",
      provider: "chat-completions",
      apiKey: "secret-key",
      model: "glm-test",
      baseUrl: "https://example.test/v1",
    },
    note: "Bitte Angebot fertig machen",
    projects: [],
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"suggestions\":[]}" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(text, "{\"suggestions\":[]}");
  assert.equal(calls[0].url, "https://example.test/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key");
  assert.equal(JSON.parse(calls[0].init.body).model, "glm-test");
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
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: " Angebot bis Freitag fertig machen " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(text, "Angebot bis Freitag fertig machen");
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-or-test");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "google/gemini-2.5-flash");
  const audioPart = body.messages[0].content.find(
    (part) => part.type === "input_audio",
  );
  assert.equal(audioPart.input_audio.data, "QUJD");
  assert.equal(audioPart.input_audio.format, "wav");
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
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(JSON.parse(calls[0].init.body).model, "openai/gpt-4o-audio-preview");
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

test("an empty suggestions list is a valid provider answer", () => {
  const result = buildProcessingResultFromProviderText({
    note: "Milch kaufen",
    nowIso: "2026-07-07T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
    providerText: JSON.stringify({ suggestions: [] }),
  });

  assert.equal(result.rawNote.processed, true);
  assert.deepEqual(result.suggestions, []);
});

test("open tasks are listed in the prompt with a dedupe instruction", async () => {
  const calls = [];
  await callAiProvider({
    config: GLM_TEST_CONFIG,
    note: "Milch kaufen",
    projects: [],
    openTasks: [
      { title: "Milch kaufen", projectId: "project-1", dueDate: "2026-07-08" },
    ],
    today: "2026-07-07",
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply('{"suggestions":[]}');
    },
  });

  const prompt = JSON.parse(calls[0].init.body).messages[1].content;
  assert.match(prompt, /Bereits vorhandene offene Aufgaben/);
  assert.match(prompt, /Milch kaufen/);
  assert.match(prompt, /leere suggestions-Liste/);
});

test("note processing requests strict json output via response_format", async () => {
  const calls = [];
  await callAiProvider({
    config: GLM_TEST_CONFIG,
    note: "Angebot fertig machen",
    projects: [],
    fetchFn: async (url, init) => {
      calls.push({ init });
      return chatReply('{"suggestions":[]}');
    },
  });

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("processNoteWithProvider retries once after a malformed answer", async () => {
  let attempt = 0;
  const result = await processNoteWithProvider({
    config: GLM_TEST_CONFIG,
    note: "Angebot fertig machen",
    projects: [],
    fetchFn: async () => {
      attempt += 1;
      return chatReply(
        attempt === 1
          ? "Tut mir leid, hier kommt Prosa statt JSON."
          : JSON.stringify({
              suggestions: [
                {
                  suggestedTitle: "Angebot fertigstellen",
                  suggestedDescription: "Angebot finalisieren.",
                  suggestedProjectId: null,
                  suggestedNewProjectTitle: "Vertrieb",
                  confidence: 0.9,
                  priority: "high",
                  dueDate: null,
                  reasoning: "Klare Aufgabe.",
                  needsReview: false,
                },
              ],
            }),
      );
    },
  });

  assert.equal(attempt, 2);
  assert.equal(result.suggestions.length, 1);
});

test("processNoteWithProvider gives up after the second malformed answer", async () => {
  let attempt = 0;
  await assert.rejects(
    () =>
      processNoteWithProvider({
        config: GLM_TEST_CONFIG,
        note: "Angebot fertig machen",
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

test("processNoteWithProvider does not retry provider HTTP errors", async () => {
  let attempt = 0;
  await assert.rejects(
    () =>
      processNoteWithProvider({
        config: GLM_TEST_CONFIG,
        note: "Angebot fertig machen",
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

test("photo extraction requires the openrouter key and sends the image", async () => {
  const missing = resolveVisionConfig({});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /OPENROUTER_API_KEY/);

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
      callAiProvider({
        config: {
          id: "deepseek-v4-flash",
          label: "DeepSeek V4 Flash",
          provider: "chat-completions",
          apiKey: "secret-key",
          model: "deepseek-v4-flash",
          baseUrl: "https://example.test",
        },
        note: "Bitte Angebot fertig machen",
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
