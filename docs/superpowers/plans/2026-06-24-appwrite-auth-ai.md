# Appwrite Auth And AI Implementation Plan

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

- [ ] Define all allowed user-facing AI model IDs and labels.
- [ ] Resolve API keys, base URLs, and overridable model slugs from environment variables.
- [ ] Validate AI JSON output and return typed suggestions.
- [ ] Test missing API keys and malformed JSON responses.

### Task 2: Server Route

**Files:**
- Create: `src/app/api/ai/process-note/route.ts`

- [ ] Accept note text, enabled projects, and selected model.
- [ ] Require an Appwrite JWT in the `Authorization` header.
- [ ] Verify the JWT with Appwrite Account API.
- [ ] Return structured suggestions or explicit JSON errors.

### Task 3: Appwrite Persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/appwrite.ts`
- Create: `src/lib/appwrite-store.ts`
- Modify: `src/lib/mock-data.ts`

- [ ] Add user settings with selected AI model.
- [ ] Load projects, tasks, raw notes, suggestions, and tags from Appwrite collections.
- [ ] Seed new users once with initial data and persist it to Appwrite.
- [ ] Synchronize changes to Appwrite without localStorage.

### Task 4: Auth And Settings UI

**Files:**
- Modify: `src/components/rote-agenda-app.tsx`

- [ ] Add login and registration UI.
- [ ] Load Appwrite data after login.
- [ ] Save data changes to Appwrite.
- [ ] Add settings controls for model selection.
- [ ] Process capture notes through `/api/ai/process-note`.
- [ ] Show clear setup/API/auth errors instead of falling back.

### Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/appwrite-hosting.md`

- [ ] Document Appwrite Auth, collection IDs, collection permissions, and environment variables.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
