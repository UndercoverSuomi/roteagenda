import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL_ID,
} from "./ai-models.ts";
import {
  buildProcessingResultFromProviderText,
  callAiProvider,
  extractProviderText,
  parseProviderJson,
  resolveAiModelConfig,
} from "./ai-server.ts";

test("default model is one of the selectable AI models", () => {
  assert.ok(AI_MODEL_OPTIONS.some((option) => option.id === DEFAULT_AI_MODEL_ID));
});

test("missing provider API key returns a clear configuration error", () => {
  const result = resolveAiModelConfig("openai-gpt-5-5", {});

  assert.equal(result.ok, false);
  assert.match(result.error, /OPENAI_API_KEY/);
  assert.match(result.error, /OpenAI GPT-5\.5/);
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
