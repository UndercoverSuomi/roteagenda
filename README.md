# Rote Agenda

Rote Agenda ist ein webbasiertes, mobile-first MVP fuer Capture-first Aufgaben- und Projektorganisation. Rohnotizen werden serverseitig mit einem zentral konfigurierten KI-Anbieter in strukturierte Aufgaben, Projektzuordnungen, Deadlines, Prioritaeten und pruefbare Vorschlaege uebersetzt.

Die Oberflaeche ist zuerst als responsives Webtool gedacht: schnell am Handy erfassen, bequem am Desktop pruefen und organisieren. Die mobile Informationsarchitektur bleibt bewusst App-tauglich, damit spaeter eine Android-Version darauf aufbauen kann.

## Kernflow

- Anmelden oder registrieren
- Notiz schnell erfassen
- KI verarbeitet und klassifiziert die Rohnotiz
- Vorschlag pruefen, bearbeiten, uebernehmen oder ignorieren
- Aufgabe erscheint im passenden Projekt und auf dem Heute-Dashboard
- Aufgaben abhaken und manuell bearbeiten

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- lucide-react
- Appwrite Auth
- Appwrite Databases
- zentral konfigurierte KI-Provider ueber Next.js Route Handler

## Entwicklung

```bash
npm run dev
```

Danach http://localhost:3000 oeffnen.

## Appwrite und KI

Die App erfordert Appwrite Auth und Appwrite Databases. Nutzer melden sich per E-Mail und Passwort an; Projekte, Aufgaben, Rohnotizen, Vorschlaege, Tags und die Modellwahl werden in Appwrite gespeichert.

Pflichtwerte fuer Appwrite:

```bash
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=6a3bbc6600236e6bf22a
NEXT_PUBLIC_APPWRITE_DATABASE_ID=...
NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID=...
NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID=...
NEXT_PUBLIC_APPWRITE_RAW_NOTES_COLLECTION_ID=...
NEXT_PUBLIC_APPWRITE_SUGGESTIONS_COLLECTION_ID=...
NEXT_PUBLIC_APPWRITE_TAGS_COLLECTION_ID=...
```

Zentrale KI-Keys werden nur serverseitig als Appwrite/Next Environment Variables gesetzt. Wenn ein gewaehltes Modell keinen Key hat oder ein Anbieter fehlerhaft antwortet, zeigt die App eine klare Fehlermeldung und nutzt keinen Mock-Fallback.

```bash
OPENAI_API_KEY=...
ZAI_API_KEY=...
MOONSHOT_API_KEY=...
DASHSCOPE_API_KEY=...
MINIMAX_API_KEY=...
DEEPSEEK_API_KEY=...
```

Optionale Overrides fuer Provider-Base-URLs und Modell-Slugs:

```bash
OPENAI_GPT_5_5_MODEL=gpt-5.5
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_GLM_5_2_MODEL=glm-5.2
MOONSHOT_BASE_URL=https://api.moonshot.ai/v1
MOONSHOT_KIMI_K2_7_MODEL=kimi-k2.7
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
DASHSCOPE_QWEN_3_7_PLUS_MODEL=qwen3.7-plus
DASHSCOPE_QWEN_3_7_MAX_MODEL=qwen3.7-max
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_M3_MODEL=MiniMax-M3
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_V4_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_V4_FLASH_MODEL=deepseek-v4-flash
```

## Hosting

Die App ist fuer Appwrite Sites vorbereitet. Die exakten Schritte stehen in [docs/appwrite-hosting.md](docs/appwrite-hosting.md).

## Checks

```bash
npm test
npm run lint
npm run build
```
