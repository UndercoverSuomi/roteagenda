# Appwrite Auth And AI Implementation Plan

> **Status (2026-07-13): Vollständig umgesetzt — historisches Dokument.**
> Alle Tasks sind seit den Commits `4ba4748` (Auth + AI) bis `115cf62`
> (production-ready) live; die Kästchen unten sind nachträglich abgehakt.
> Abweichungen gegenüber dem Plan:
> - Die Route heißt `src/app/api/ai/enhance-note/route.ts` (nicht
>   `process-note`); Link-/Foto-Notizen verarbeitet zusätzlich der
>   asynchrone Worker `functions/process-note/` (Appwrite Function).
> - `src/lib/mock-data.ts` wurde ersatzlos entfernt (kein Mock-Fallback);
>   neue Accounts starten leer statt mit Seed-Daten.
> - Inzwischen existieren vier weitere KI-Routen (transcribe,
>   extract-image, daily-briefing, graph-insights) nach demselben Muster.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Appwrite authentication, Appwrite-backed persistence, and centrally configured real AI model processing without a mock fallback.

**Architecture:** The browser owns Appwrite login and persistence with the Web SDK. The Next.js Route Handler owns model execution and verifies the current Appwrite user via a short-lived JWT before calling centrally configured provider APIs. Provider failures and missing keys return explicit errors.

**Tech Stack:** Next.js 16 App Router, React 19, Appwrite Web SDK 26, TypeScript, Node test runner for pure TypeScript helpers.

---

### Task 1: Provider Registry And Validation

**Files:**
- Create: `src/lib/ai-models.ts`
- Create: `src/lib/ai-server.ts`
- Test: `src/lib/ai-server.test.mjs`

- [x] Define all allowed user-facing AI model IDs and labels.
- [x] Resolve API keys, base URLs, and overridable model slugs from environment variables.
- [x] Validate AI JSON output and return typed suggestions.
- [x] Test missing API keys and malformed JSON responses.

### Task 2: Server Route

**Files:**
- Create: `src/app/api/ai/process-note/route.ts` *(umgesetzt als `enhance-note/route.ts`)*

- [x] Accept note text, enabled projects, and selected model.
- [x] Require an Appwrite JWT in the `Authorization` header.
- [x] Verify the JWT with Appwrite Account API.
- [x] Return structured suggestions or explicit JSON errors.

### Task 3: Appwrite Persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/appwrite.ts`
- Create: `src/lib/appwrite-store.ts`
- Modify: `src/lib/mock-data.ts` *(stattdessen ersatzlos entfernt)*

- [x] Add user settings with selected AI model.
- [x] Load projects, tasks, raw notes, suggestions, and tags from Appwrite collections.
- [x] ~~Seed new users once with initial data and persist it to Appwrite.~~ *(Entscheidung: neue Accounts starten leer)*
- [x] Synchronize changes to Appwrite without localStorage.

### Task 4: Auth And Settings UI

**Files:**
- Modify: `src/components/rote-agenda-app.tsx`

- [x] Add login and registration UI.
- [x] Load Appwrite data after login.
- [x] Save data changes to Appwrite.
- [x] Add settings controls for model selection.
- [x] Process capture notes through `/api/ai/process-note` *(heute: `/api/ai/enhance-note`)*.
- [x] Show clear setup/API/auth errors instead of falling back.

### Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/appwrite-hosting.md`

- [x] Document Appwrite Auth, collection IDs, collection permissions, and environment variables.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run build`.
