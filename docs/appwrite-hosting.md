# Appwrite Hosting

Diese Anleitung bereitet Rote Agenda fuer Appwrite Sites mit Appwrite Auth, Appwrite Databases und serverseitiger KI-Verarbeitung vor.

## Appwrite Projekt

1. Appwrite Console oeffnen und das Projekt `Rote Agenda` auswaehlen.
2. Unter `Auth` E-Mail/Passwort-Login aktivieren.
3. Unter `Platforms` die Web-Hosts eintragen:
   - `localhost` fuer lokale Entwicklung
   - `roteagenda.appwrite.network` fuer Produktion
4. Unter `Databases` eine Datenbank fuer Rote Agenda anlegen.
5. Fuenf Collections anlegen und die Collection IDs als Environment Variables hinterlegen.

## Collections

Alle Collections sollten Document Security nutzen. Erlaube authentifizierten Nutzern das Erstellen von Dokumenten; die App setzt beim Speichern pro Dokument `read`, `update` und `delete` fuer den jeweiligen Nutzer.

### projects

- `id` string, required
- `title` string, required
- `description` string, required
- `keywords` string array, required
- `progress` integer, required
- `aiEnabled` boolean, required
- `createdAt` string, required
- `updatedAt` string, required

### tasks

- `id` string, required
- `title` string, required
- `description` string, required
- `projectId` string, required
- `status` string, required
- `priority` string, required
- `dueDate` string, optional
- `sourceNoteId` string, optional
- `createdBy` string, required
- `createdAt` string, required
- `updatedAt` string, required

### rawNotes

- `id` string, required
- `content` string, required
- `processed` boolean, required
- `createdAt` string, required

### suggestions

- `id` string, required
- `rawNoteId` string, required
- `suggestedTitle` string, required
- `suggestedDescription` string, required
- `suggestedProjectId` string, optional
- `suggestedNewProjectTitle` string, optional
- `confidence` float, required
- `priority` string, required
- `dueDate` string, optional
- `reasoning` string, required
- `needsReview` boolean, required
- `state` string, required
- `createdAt` string, required

### tags

- `id` string, required
- `label` string, required
- `color` string, required

## Environment Variables

Public Appwrite-Werte:

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

Serverseitige KI-Keys:

```bash
OPENAI_API_KEY=...
ZAI_API_KEY=...
MOONSHOT_API_KEY=...
DASHSCOPE_API_KEY=...
MINIMAX_API_KEY=...
DEEPSEEK_API_KEY=...
```

Optionale Provider-Overrides:

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

Fehlt ein Key fuer das vom Nutzer gewaehlte Modell, gibt `/api/ai/process-note` eine klare Fehlermeldung zurueck. Es gibt keinen Mock-KI-Fallback.

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
8. Environment Variables setzen.
9. Deploy starten.
10. Nach erfolgreichem Build ueber `Visit site` die Appwrite-URL oeffnen.

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
