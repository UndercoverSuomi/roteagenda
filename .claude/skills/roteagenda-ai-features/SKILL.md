---
name: roteagenda-ai-features
description: Neue KI-Funktion (Route, Provider-Aufruf, Client, Tests) nach dem etablierten Muster dieses Repos hinzufügen — inkl. Modellwahl über den OpenRouter-Katalog. Nutzen bei neuen KI-Routen, Modalitäten oder Prompt-Änderungen.
---

# Rote Agenda: KI-Funktion hinzufügen

## Das etablierte Muster (3× bewährt)

1. **`src/lib/ai-server.ts`** — Kernlogik, pure und node-testbar:
   - Modell-Auflösung: direkter Provider-Key hat Vorrang, sonst OpenRouter
     (`resolveAiModelConfig`); Medien-Routen nutzen `resolveOpenRouterMedia`.
   - Provider-Aufruf über `requestProvider(config, {system, user}, {maxTokens,
     json}, fetchFn)` — `json: true` setzt `response_format: json_object`
     (Responses-API: `text.format`); bei Freitext-Antworten weglassen.
   - Prompts immer **de + en** (locale-Verzweigung), Kontextlisten kappen
     (Konstanten MAX_PROMPT_*) — client- UND serverseitig.
   - JSON-Antworten durch `parseProviderJson` (toleriert Markdown-Zäune und
     Prosa) und genau **einen Retry**, aber nur bei Fehlern, deren Message mit
     „KI-Antwort" beginnt — Provider-/HTTP-Fehler nie wiederholen.
2. **Route `src/app/api/ai/<name>/route.ts`**: `export const runtime =
   "nodejs"`, `requireAppwriteUser(request)` (JWT), `createRateLimiter(...)`
   pro Route, jede Eingabe validieren und mit Obergrenzen versehen; Fehler als
   `{ error }` mit passendem Status (RouteError → status, „KI-Antwort…" → 502).
3. **`src/lib/ai-client.ts`**: Wrapper über `authorizedJsonPost` (holt das
   Appwrite-JWT); Payload-Form prüfen, klare deutsche Fallback-Fehlertexte.
4. **Tests `src/lib/ai-server.test.mjs`**: `fetchFn`-Stubs (`chatReply`-Helper),
   Prompt-Inhalte und Request-Bodys assertieren. Getestete Module nutzen
   **relative `./x.ts`-Imports** (kein `@/`-Alias — Node kennt ihn nicht).
5. `.env.example` um neue Env-Overrides ergänzen, README-Kernflow anpassen.

## Modellwahl / Modellwechsel

- Erst den **OpenRouter-Katalog prüfen**, nie aus dem Gedächtnis:
  `GET https://openrouter.ai/api/v1/models` → `architecture.input_modalities`
  (text/image/audio/video) und `pricing.prompt`/`pricing.completion`.
- Medien-Default ist `xiaomi/mimo-v2.5` (Audio + Bild + Video, sehr günstig).
  **Achtung: `xiaomi/mimo-v2.5-pro` ist text-only** — für Diktat/OCR unbrauchbar.
- Multimodale Inhalte gehen als Content-Parts: `input_audio` (Base64 + Format)
  bzw. `image_url` mit `data:image/jpeg;base64,…`-URI.

## Kosten & Verhalten

- Notiz-Pipeline: erst Notiz persistieren, dann KI (`runNoteEnhancement`) —
  ein KI-Fehler darf nie Nutzereingaben verlieren.
- Leere Ergebnislisten sind gültige Antworten (Dedupe!) und brauchen einen
  freundlichen UI-Hinweis statt eines Fehlers.
