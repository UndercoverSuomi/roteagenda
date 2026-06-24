# Rote Agenda

Rote Agenda ist ein webbasiertes, mobile-first MVP für Capture-first Aufgaben- und Projektorganisation. Rohnotizen werden lokal von einer Mock-KI in strukturierte Aufgaben, Projektzuordnungen, Deadlines, Prioritäten und prüfbare Vorschläge übersetzt.

Die Oberfläche ist zuerst als responsives Webtool gedacht: schnell am Handy erfassen, bequem am Desktop prüfen und organisieren. Die mobile Informationsarchitektur bleibt bewusst App-tauglich, damit später eine Android-Version darauf aufbauen kann.

## Kernflow

- Notiz schnell erfassen
- Mock-KI verarbeitet und klassifiziert die Rohnotiz
- Vorschlag prüfen, bearbeiten, übernehmen oder ignorieren
- Aufgabe erscheint im passenden Projekt und auf dem Heute-Dashboard
- Aufgaben abhaken und manuell bearbeiten

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- lucide-react
- lokale Mock-Daten und localStorage

## Entwicklung

```bash
npm run dev
```

Danach http://localhost:3000 öffnen.

## Hosting

Die App ist für Appwrite Sites vorbereitet. Die exakten Schritte stehen in [docs/appwrite-hosting.md](docs/appwrite-hosting.md).

## Checks

```bash
npm run lint
npm run build
```
