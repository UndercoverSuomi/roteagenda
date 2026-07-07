# Rote Agenda

Rote Agenda ist eine webbasierte, mobile-first Notiz- und Aufgaben-App. Notizen sind die Kern-Entitaet (wie bei Google Keep): schnell festhalten, und eine zentral konfigurierte KI formuliert sie aus, vergibt Tags, ordnet sie Projekten zu, verlinkt thematisch passende Notizen und erkennt Aufgaben und Termine — als pruefbare Vorschlaege, nie ungefragt.

Die Oberflaeche ist zuerst als responsives Webtool gedacht: schnell am Handy erfassen, bequem am Desktop pruefen und organisieren. Die App ist als PWA installierbar und offline nutzbar; die mobile Informationsarchitektur bleibt bewusst App-tauglich, damit spaeter eine Android-Version darauf aufbauen kann.

## Kernflow

- Registrieren oder anmelden (inkl. Passwort-zuruecksetzen per E-Mail)
- Notiz anlegen — im Notizen-Grid, per Schnellnotiz, per Mikrofon eingesprochen (Transkription ueber ein audiofaehiges OpenRouter-Modell, Standard `google/gemini-2.5-flash`, Override via `OPENROUTER_TRANSCRIBE_MODEL`) oder als Foto eines Notizzettels (OCR ueber ein bildfaehiges Modell, Override via `OPENROUTER_VISION_MODEL`)
- Die KI veredelt jede neue Notiz automatisch: Titel und ausformulierte Fassung, 1-5 Tags, Projektzuordnung, Verlinkung mit verwandten Notizen (auch manuell erneut ausloesbar)
- Klingt etwas nach einem Termin ("Arzttermin Praxis41 morgen um 9"), schlaegt die KI einen Kalendereintrag mit Uhrzeit vor — Uebernahme geht an den Google Kalender — plus sinnvolle Vorbereitungs-Aufgaben als eigene Vorschlaege
- Aufgabenvorschlaege pruefen, bearbeiten, uebernehmen oder ignorieren; die KI kennt Projekte und offene Aufgaben und schlaegt keine Duplikate vor
- Notizen pinnen, taggen, durchsuchen und ueber verlinkte Notizen navigieren
- Tagesbriefing auf dem Heute-Screen: die KI fasst Ueberfaelliges und heute Faelliges kurz zusammen
- Aufgaben abhaken, bearbeiten, per Schnellauswahl verschieben (heute/morgen/naechste Woche), Projekte anlegen und verwalten
- Suche ueber Aufgaben, Projekte und Notizen (inkl. Tags und KI-Fassung)
- Geloeschte Notizen, Aufgaben und Projekte lassen sich direkt per Toast rueckgaengig machen
- Jede Ansicht hat eine eigene URL: Browser-Zurueck funktioniert; Notizen, Aufgaben und Projekte sind verlinkbar

## Offline & Sync

- Alle Schreibzugriffe laufen ueber eine persistente Warteschlange (localStorage) und ueberleben Reloads; fehlgeschlagene Aenderungen lassen sich erneut versuchen oder gezielt verwerfen.
- Die App startet offline: Der Service Worker cached die Oberflaeche, die Daten kommen aus dem lokalen Cache des zuletzt angemeldeten Nutzers, und alles synchronisiert automatisch, sobald wieder eine Verbindung besteht.
- Appwrite Realtime haelt mehrere Geraete und offene Tabs live synchron.
- Beim Abmelden werden lokaler Cache und Warteschlange geloescht.

## Einstellungen

- Sprache: Deutsch/Englisch (folgt initial der Browsersprache, umstellbar unter "Mehr")
- Design: System/Hell/Dunkel
- KI-Modell pro Account waehlbar
- Projektfarben: jede Aufgabe traegt die Farbe ihres Projekts, Prioritaet als farbiger Punkt

## Google-Integration (optional)

In der Aufgabenansicht lassen sich Aufgaben per Klick an Google uebergeben: mit Termin als Google-Kalender-Eintrag, ohne Termin als Google Task. Erfolgreiche Uebertragungen werden an der Aufgabe gespeichert und ueberleben Reloads; ein erneutes Senden ist bewusst moeglich.

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

Nach einem Update mit Schema-Aenderungen das Script einfach erneut ausfuehren — es ergaenzt nur fehlende Attribute. Wichtig: Die Notiz-Features (Titel, Tags, Verlinkung, Pinnen) und Terminvorschlaege brauchen die neuen Attribute in `rawNotes` und `suggestions`; ohne erneuten Script-Lauf schlagen Notiz-Speicherungen mit einem Sync-Fehler fehl.

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

Optionale Overrides fuer Base-URLs und Modell-Slugs stehen in [.env.example](.env.example). Die Route `/api/ai/process-note` verlangt eine gueltige Appwrite-Session (JWT), begrenzt Notizen auf 4000 Zeichen und drosselt auf 20 Anfragen pro Nutzer und 10 Minuten. Auch `/api/ai/transcribe`, `/api/ai/extract-image` und `/api/ai/daily-briefing` verlangen eine gueltige Session und sind pro Nutzer gedrosselt.

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
