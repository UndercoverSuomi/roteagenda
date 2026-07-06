<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projektstruktur

- `src/components/rote-agenda-app.tsx` — Haupt-Orchestrator: gesamter App-State, Handler und Screen-Weiche. Screens werden über einen `screen`-State gewechselt, nicht über Routen.
- `src/components/screens/` — eine Datei pro Screen (auth, welcome, today, capture, inbox, projects, project-detail, task-detail, more). Screens sind zustandsarm; Daten und Callbacks kommen als Props aus dem Orchestrator.
- `src/components/editors/` — Modal-Editoren für Aufgaben und Projekte.
- `src/components/ui/` — wiederverwendbare Bausteine (primitives, controls, task-items, suggestion-card, navigation, insight-panel, google-section).
- `src/components/app-types.ts` / `app-helpers.ts` — gemeinsame UI-Typen, Label-Maps und pure Helfer.
- `src/lib/` — Appwrite-Client und -Store, KI-Server-Logik, i18n, Theme, Recorder, Sync-Queue. Tests (`*.test.mjs`, Node-Test-Runner) liegen daneben.
- `src/app/api/ai/` — Route Handler für KI-Verarbeitung und Transkription (Appwrite-JWT-Prüfung + Rate-Limit).

# Konventionen

- Jede sichtbare UI-Beschriftung braucht einen de/en-Eintrag in `src/lib/i18n.ts`.
- Schema-Änderungen an den Collections brauchen drei Stellen: `src/lib/types.ts`, `scripts/setup-appwrite.mjs` und ggf. `restoreNullableFields` in `src/lib/appwrite-store.ts`.
- Checks vor jedem Push: `npm test`, `npm run lint`, `npm run build`.
