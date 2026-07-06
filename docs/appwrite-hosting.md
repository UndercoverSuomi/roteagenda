# Appwrite Hosting

Diese Anleitung bereitet Rote Agenda fuer Appwrite Sites mit Appwrite Auth, Appwrite Databases und serverseitiger KI-Verarbeitung vor.

## Appwrite Projekt

1. Appwrite Console oeffnen und das Projekt `Rote Agenda` auswaehlen.
2. Unter `Auth` E-Mail/Passwort-Login aktivieren.
3. Unter `Overview` → `Platforms` die Web-Hosts eintragen:
   - `localhost` fuer lokale Entwicklung
   - `roteagenda.appwrite.network` (bzw. eigene Domain) fuer Produktion
   - Wichtig: Ohne Plattform-Eintrag schlagen Login und der Passwort-Reset-Link fehl.
4. Unter `Overview` → `Integrations` → `API keys` einen Key anlegen und bei den Scopes alle Eintraege der Kategorie **Databases** anhaken (`databases.*`, `collections.*`, `attributes.*` – jeweils read und write). Der Key wird nur fuer das Setup-Script gebraucht, nicht fuer die App.

## Datenbank und Collections anlegen

```bash
APPWRITE_API_KEY=<api-key> node scripts/setup-appwrite.mjs
```

Das Script ist idempotent und erstellt:

- Datenbank `roteagenda`
- Collections `projects`, `tasks`, `rawNotes`, `suggestions` mit Document Security und `create("users")`-Berechtigung
- alle Attribute laut Schema (siehe unten)
- `.env.local` mit den passenden `NEXT_PUBLIC_APPWRITE_*`-Werten

Die App setzt beim Speichern pro Dokument `read`, `update` und `delete` fuer den jeweiligen Nutzer.

### Schema-Referenz

Nur relevant, falls Collections manuell angelegt werden. Textfelder, die leer sein koennen, sind optional; die App validiert Pflichtfelder clientseitig.

**projects:** `id` (string, required), `title` (string, required), `description` (string), `keywords` (string array), `progress` (integer, required), `aiEnabled` (boolean, required), `createdAt`/`updatedAt` (string, required)

**tasks:** `id` (string, required), `title` (string, required), `description` (string), `projectId` (string, required), `status` (string, required), `priority` (string, required), `dueDate` (string), `sourceNoteId` (string), `createdBy` (string, required), `createdAt`/`updatedAt` (string, required)

**rawNotes:** `id` (string, required), `content` (string, required), `processed` (boolean, required), `createdAt` (string, required)

**suggestions:** `id` (string, required), `rawNoteId` (string, required), `suggestedTitle` (string, required), `suggestedDescription` (string), `suggestedProjectId` (string), `suggestedNewProjectTitle` (string), `confidence` (float, required), `priority` (string, required), `dueDate` (string), `reasoning` (string), `needsReview` (boolean, required), `state` (string, required), `createdAt` (string, required)

## Environment Variables

Die Code-Defaults entsprechen bereits den vom Script angelegten IDs. Nur bei abweichenden IDs setzen:

```bash
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=6a3bbc6600236e6bf22a
NEXT_PUBLIC_APPWRITE_DATABASE_ID=roteagenda
NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID=projects
NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID=tasks
NEXT_PUBLIC_APPWRITE_RAW_NOTES_COLLECTION_ID=rawNotes
NEXT_PUBLIC_APPWRITE_SUGGESTIONS_COLLECTION_ID=suggestions
```

Serverseitige KI-Keys. Am einfachsten ist ein OpenRouter-Key fuer alle Modelle:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Alternativ (oder zusaetzlich, direkte Keys haben Vorrang) je Anbieter:

```bash
OPENAI_API_KEY=...
ZAI_API_KEY=...
MOONSHOT_API_KEY=...
DASHSCOPE_API_KEY=...
MINIMAX_API_KEY=...
DEEPSEEK_API_KEY=...
```

Optionale Provider-Overrides (Base-URLs, Modell-Slugs): siehe [.env.example](../.env.example).

Fehlt ein Key fuer das vom Nutzer gewaehlte Modell, gibt `/api/ai/process-note` eine klare Fehlermeldung zurueck. Es gibt keinen Mock-KI-Fallback. Die Route drosselt zusaetzlich auf 20 Anfragen pro Nutzer und 10 Minuten und begrenzt Notizen auf 4000 Zeichen.

## GitHub Deployment

1. In Appwrite `Sites` oeffnen.
2. `Create site` waehlen.
3. GitHub verbinden und das Repository `UndercoverSuomi/roteagenda` auswaehlen.
4. Als Produktions-Branch `main` setzen.
5. Als Root Directory `.` setzen.
6. Als Framework `Next.js` auswaehlen.
7. Build Settings:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `./.next`
   - Rendering: `SSR`
   - Runtime: `Node.js 22` oder neuer
8. Environment Variables setzen (mindestens die KI-Keys).
9. Deploy starten.
10. Nach erfolgreichem Build ueber `Visit site` die Appwrite-URL oeffnen und die Domain als Platform eintragen (siehe oben).

## Lokale Vorabpruefung

```bash
npm test
npm run lint
npm run build
```

Optional danach lokal wie Appwrite im Production-Modus starten:

```bash
npm run start
```

## Referenzen

- Appwrite Next.js Quickstart: https://appwrite.io/docs/products/sites/quick-start/nextjs
- Appwrite Sites Quickstart: https://appwrite.io/docs/products/sites/quick-start
- Appwrite Sites Build Settings: https://appwrite.io/docs/products/sites/develop
- Appwrite Web SDK: https://appwrite.io/docs/getting-started-for-web
