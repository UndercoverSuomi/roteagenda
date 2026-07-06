# Rote Agenda

Rote Agenda ist ein webbasiertes, mobile-first Tool fuer Capture-first Aufgaben- und Projektorganisation. Rohnotizen werden serverseitig mit einem zentral konfigurierten KI-Anbieter in strukturierte Aufgaben, Projektzuordnungen, Deadlines, Prioritaeten und pruefbare Vorschlaege uebersetzt.

Die Oberflaeche ist zuerst als responsives Webtool gedacht: schnell am Handy erfassen, bequem am Desktop pruefen und organisieren. Die App ist als PWA installierbar; die mobile Informationsarchitektur bleibt bewusst App-tauglich, damit spaeter eine Android-Version darauf aufbauen kann.

## Kernflow

- Registrieren oder anmelden (inkl. Passwort-zuruecksetzen per E-Mail)
- Notiz schnell erfassen — getippt oder per Mikrofon eingesprochen (Aufnahme wird serverseitig ueber ein audiofaehiges OpenRouter-Modell transkribiert, Standard `google/gemini-2.5-flash`, Override via `OPENROUTER_TRANSCRIBE_MODEL`)
- KI verarbeitet und klassifiziert die Rohnotiz (mit aktuellem Datum als Referenz, auf Deutsch oder Englisch)
- Vorschlag pruefen, bearbeiten, uebernehmen oder ignorieren
- Aufgabe erscheint im passenden Projekt und auf dem Heute-Dashboard
- Aufgaben abhaken, bearbeiten, Projekte anlegen und verwalten

## Einstellungen

- Sprache: Deutsch/Englisch (folgt initial der Browsersprache, umstellbar unter "Mehr")
- Design: System/Hell/Dunkel
- KI-Modell pro Account waehlbar
- Projektfarben: jede Aufgabe traegt die Farbe ihres Projekts, Prioritaet als farbiger Punkt

## Google-Integration (optional)

In der Aufgabenansicht lassen sich Aufgaben per Klick an Google uebergeben: mit Termin als Google-Kalender-Eintrag, ohne Termin als Google Task.

- Ohne Einrichtung funktioniert der Kalender-Button sofort (oeffnet Google Kalender mit vorbefuelltem Termin zum Bestaetigen).
- Fuer Google Tasks und das direkte Anlegen im Kalender wird eine OAuth-Client-ID benoetigt:
  1. In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) ein Projekt anlegen.
  2. Unter "APIs & Services" die **Google Tasks API** und **Google Calendar API** aktivieren.
  3. OAuth-Zustimmungsbildschirm konfigurieren (External, eigener Account als Testnutzer reicht).
  4. Anmeldedaten → "OAuth-Client-ID erstellen" → Typ "Webanwendung" → als Authorized JavaScript origins `http://localhost:3000` und `https://roteagenda.appwrite.network` eintragen.
  5. Die Client-ID als `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local` und in den Appwrite-Site-Variablen setzen.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- lucide-react
- Appwrite Auth + Appwrite Databases (Web SDK)
- zentral konfigurierte KI-Provider ueber Next.js Route Handler

## Setup

### 1. Appwrite vorbereiten

Einmalig einen API-Key in der Appwrite Console anlegen (Overview → Integrations → API keys; bei den Scopes alle Eintraege der Kategorie **Databases** anhaken, d. h. `databases.*`, `collections.*` und `attributes.*` jeweils mit read und write) und dann:

```bash
npm install
APPWRITE_API_KEY=<api-key> node scripts/setup-appwrite.mjs
```

Das Script legt idempotent die Datenbank `roteagenda` mit den vier Collections `projects`, `tasks`, `rawNotes` und `suggestions` samt Attributen an und schreibt die IDs in `.env.local`. Da der Code dieselben IDs als Defaults nutzt, sind abweichende Environment Variables nur noch bei eigenen IDs noetig.

Zusaetzlich in der Appwrite Console:

- `Auth` → E-Mail/Passwort-Login aktivieren
- `Overview` → `Platforms` → Web-Plattform fuer `localhost` und die Produktions-Domain eintragen (noetig fuer Login und den Passwort-Reset-Link)

### 2. KI-Provider konfigurieren

Zentrale KI-Keys werden nur serverseitig gesetzt (lokal in `.env.local`, in Produktion als Appwrite-Site-Variablen). Ohne Key fuer das gewaehlte Modell liefert die App eine klare Fehlermeldung — es gibt keinen Mock-Fallback.

**Empfohlen: OpenRouter.** Ein einziger Key schaltet alle Modelle frei:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

**Alternativ: direkte Provider-Keys.** Sie haben Vorrang vor OpenRouter, falls beides gesetzt ist:

```bash
OPENAI_API_KEY=...
ZAI_API_KEY=...
MOONSHOT_API_KEY=...
DASHSCOPE_API_KEY=...
MINIMAX_API_KEY=...
DEEPSEEK_API_KEY=...
```

Optionale Overrides fuer Base-URLs und Modell-Slugs stehen in [.env.example](.env.example). Die Route `/api/ai/process-note` verlangt eine gueltige Appwrite-Session (JWT), begrenzt Notizen auf 4000 Zeichen und drosselt auf 20 Anfragen pro Nutzer und 10 Minuten.

### 3. Entwicklung

```bash
npm run dev
```

Danach http://localhost:3000 oeffnen und registrieren. Neue Accounts starten leer; Projekte entstehen manuell oder aus KI-Vorschlaegen.

## Checks

```bash
npm test
npm run lint
npm run build
```

Alle drei Checks laufen auch als GitHub Action bei jedem Push.

## Hosting

Die App ist fuer Appwrite Sites vorbereitet. Die exakten Schritte stehen in [docs/appwrite-hosting.md](docs/appwrite-hosting.md).

## Rechtliches

`/impressum` und `/datenschutz` enthalten Geruest-Seiten mit `[PLATZHALTER]`-Markierungen, die vor dem oeffentlichen Betrieb ausgefuellt werden muessen.
