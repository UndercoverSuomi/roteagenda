<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projektstruktur

- `src/components/rote-agenda-app.tsx` — Haupt-Orchestrator: gesamter App-State, Handler und Screen-Weiche. Screens werden über einen `screen`-State gewechselt, nicht über Routen.
- `src/components/screens/` — eine Datei pro Screen (auth, welcome, today, notes, note-detail, capture, inbox, projects, project-detail, task-detail, search, more). Screens sind zustandsarm; Daten und Callbacks kommen als Props aus dem Orchestrator.
- `src/components/editors/` — Modal-Editoren für Notizen, Aufgaben und Projekte.
- `src/components/ui/` — wiederverwendbare Bausteine (primitives, controls, task-items, suggestion-card, navigation, insight-panel, google-section).
- `src/components/app-types.ts` / `app-helpers.ts` — gemeinsame UI-Typen, Label-Maps und pure Helfer.
- `src/lib/` — Appwrite-Client und -Store, KI-Server-Logik, i18n, Theme, Recorder. Tests (`*.test.mjs`, Node-Test-Runner) liegen daneben; getestete Module nutzen relative `./x.ts`-Imports statt `@/`-Alias.
- `src/lib/sync-queue.ts` + `offline-store.ts` — Schreibzugriffe sind serialisierbare `SyncOp`-Objekte (definiert in `appwrite-store.ts`), die in localStorage überleben; `offline-store.ts` cached zusätzlich den letzten Datenstand pro Nutzer.
- `src/lib/realtime.ts` — purer Reducer für Appwrite-Realtime-Events; `appwrite-documents.ts` wandelt Appwrite-Dokumente in App-Objekte (pure, node-testbar).
- `public/sw.js` — Service Worker für die Offline-Shell; cached nur Same-Origin-GETs, nie `/api/` oder Cross-Origin (Appwrite/Google). Registrierung nur in Produktion.
- `src/app/api/ai/` — Route Handler für KI-Verarbeitung, Transkription, Foto-OCR, Link-/Video-Zusammenfassung und Briefing (Appwrite-JWT-Prüfung + Rate-Limit).
- `src/lib/web-content.ts` — nur serverseitig (node:dns): SSRF-Härtung für eingeworfene URLs, Seitenabruf mit Limits, HTML→Text, YouTube-Erkennung/oEmbed.
- `functions/process-note/` — asynchroner Notiz-Worker (Appwrite Function, DB-Event auf neue Link-/Foto-Notizen; Timeout 300 s statt 30-s-Site-Limit). Teilt sich die KI-Logik mit der App: nach Änderungen an `src/lib/(ai-server|web-content|ai-models|appwrite-documents)` immer `npm run build:worker` ausführen (Bundle ist eingecheckt) und mit `node scripts/setup-worker.mjs --key=…` neu deployen.

# Playbooks

Ausführliche, harness-unabhängige Playbooks liegen als Markdown unter `.claude/skills/*/SKILL.md` — vor der Arbeit lesen:

- `roteagenda-dev-workflow` — Checks, Browser-Verifikation, Testkonto-Etikette, Fallstricke.
- `appwrite-schema-changes` — drei Code-Stellen, MariaDB-Zeilenlimit/TEXT-Trick, Rollout-Reihenfolge.
- `roteagenda-ai-features` — Muster für neue KI-Routen inkl. OpenRouter-Katalog-Check.
- `browser-eval-testing` — React-E2E per Konsolen-Eval (projekt-unabhängig).

# Konventionen

- Notizen sind die Kern-Entität (`Note` in `types.ts`, AppData-Feld `notes`); die Appwrite-Collection heißt aus historischen Gründen weiterhin `rawNotes` (Mapping in `appwrite-config.ts`). Die KI-Veredelung läuft über `/api/ai/enhance-note` und liefert Anreicherung plus Aufgaben-/Terminvorschläge in einem Aufruf.
- Jede sichtbare UI-Beschriftung braucht einen de/en-Eintrag in `src/lib/i18n.ts`.
- Schema-Änderungen an den Collections brauchen drei Stellen: `src/lib/types.ts`, `scripts/setup-appwrite.mjs` und ggf. `restoreNullableFields` in `src/lib/appwrite-documents.ts`.
- Schreibzugriffe im Orchestrator nie direkt aufrufen, sondern als `SyncOp` über `persist()` einreihen — nur so überleben sie Reloads und Offline-Phasen.
- Checks vor jedem Push: `npm test`, `npm run lint`, `npm run build`.
