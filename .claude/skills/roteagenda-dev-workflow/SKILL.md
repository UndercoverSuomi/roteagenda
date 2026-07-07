---
name: roteagenda-dev-workflow
description: Arbeitsweise für Änderungen am Rote-Agenda-Repo — Checks, Browser-Verifikation gegen das Live-Appwrite, Testkonto-Etikette und bekannte Fallstricke. Bei jeder Feature- oder Bugfix-Arbeit in diesem Repo zuerst lesen.
---

# Rote Agenda: Entwicklungs-Workflow

## Pflicht-Checks (vor jedem Push)

```
npm test        # Node-Test-Runner, src/lib/*.test.mjs
npm run lint    # ESLint (eslint-config-next)
npm run build   # inkl. TypeScript-Check
```

## Browser-Verifikation

- `.claude/launch.json` hat zwei Konfigurationen: `dev` (npm run dev) und `prod`
  (npm run start, vorher bauen). Der Service Worker registriert sich **nur in
  Produktion** — nach einem Prod-Test SW deregistrieren und Caches löschen,
  sonst serviert er künftigen Dev-Sessions auf Port 3000 eine stale Shell.
- Das Backend ist **live** (fra.cloud.appwrite.io, Projekt im Code). Zum Testen
  existiert das Konto `claude-testkonto@example.com` / `RoteAgenda-Test-2026!`.
- Etikette: minimale Testdaten anlegen → verifizieren → „Alle Daten löschen" →
  abmelden (der Logout löscht auch lokalen Cache + Sync-Queue).
- KI-Aufrufe kosten echtes Geld (OpenRouter-Guthaben des Nutzers): vor Tests das
  Verarbeitungsmodell auf **DeepSeek V4 Flash** stellen, Aufrufe minimieren.

## Bekannte Fallstricke

- Nach dem **Löschen/Umbenennen einer API-Route** `.next/` löschen — sonst
  bricht der Build an stale generierten Typen (`.next/dev/types/validator.ts`).
- Das **Appwrite-SDK hält eine eigene fetch-Referenz**: `window.fetch` zu
  patchen fängt nur die eigenen `/api/*`-Calls ab, keine SDK-Requests.
  Fehlerpfade der Sync-Queue stattdessen mit „Gift-Ops" testen (Upsert mit
  einem in Appwrite nicht existierenden Attribut → 400).
- ESLint-Regel `react-hooks/set-state-in-effect`: kein synchrones setState am
  Effect-Anfang — Initialwert in den `useState`-Initializer verlagern (mit
  `typeof window`/`navigator`-Guard; hydration-sicher, solange die Lade-Shell
  den Wert nicht rendert).
- Jede sichtbare UI-Beschriftung braucht **de + en** in `src/lib/i18n.ts`.
- Schreibzugriffe **nie direkt**, immer `persist(label, SyncOp)` — nur so
  überleben sie Reloads/Offline (siehe AGENTS.md).
- Screens laufen über Query-Param-URLs (`src/lib/app-url.ts`, Params s/p/t/n);
  neue Screens dort + in `readInitialLocation`/popstate registrieren.
- Am Ende committen und auf `main` pushen (Workflow des Nutzers, keine PRs).
