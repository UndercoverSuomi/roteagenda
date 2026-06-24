# Appwrite Hosting

Diese Anleitung bereitet Rote Agenda für Appwrite Sites vor. Die App ist aktuell ein Next.js Webtool ohne Backend-Abhängigkeiten; es werden keine Environment-Variablen benötigt.

## Empfohlener Weg: GitHub Deployment

1. Appwrite Console öffnen und ein neues Projekt für `Rote Agenda` erstellen oder ein bestehendes Projekt auswählen.
2. In der linken Seitenleiste `Sites` öffnen.
3. `Create site` wählen.
4. GitHub verbinden und das Repository `UndercoverSuomi/roteagenda` auswählen.
5. Als Produktions-Branch `main` setzen.
6. Als Root Directory `.` setzen.
7. Als Framework `Next.js` auswählen.
8. Build Settings prüfen:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `./.next`
   - Rendering: `SSR`
   - Runtime: `Node.js 22` oder `node-22`, falls Appwrite danach fragt
9. Environment Variables leer lassen. Für den aktuellen MVP sind keine Werte erforderlich.
10. Deploy starten.
11. Nach erfolgreichem Build über `Visit site` die Appwrite-URL öffnen.

## CLI-Alternative

Appwrite empfiehlt Git-basierte Deployments für Sites. Falls du trotzdem lokal per CLI deployen willst:

```bash
npm install -g appwrite-cli
appwrite login
appwrite init project
appwrite init sites
appwrite push sites
```

Bei `appwrite init sites` dieselben Werte verwenden:

- Name: `Rote Agenda`
- Site ID: frei wählbar, zum Beispiel `rote-agenda`
- Framework: `Next.js`
- Root directory: `.`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `./.next`
- Runtime: `node-22`
- Adapter/Rendering: `ssr`

## Lokale Vorabprüfung

Vor jedem Deployment lokal ausführen:

```bash
npm run lint
npm run build
```

Optional danach lokal wie Appwrite im Production-Modus starten:

```bash
npm run start
```

## Appwrite SDK

Der Web SDK Client ist in `src/lib/appwrite.ts` konfiguriert:

- Project ID: `6a3bbc6600236e6bf22a`
- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Exports: `client`, `account`, `databases`

Beim Öffnen der App wird automatisch `client.ping()` ausgeführt. Lokal funktioniert der Ping mit `http://localhost:3000`. Falls du über `http://127.0.0.1:3000` testest und CORS-Fehler siehst, füge in Appwrite Console unter deinem Projekt zusätzlich eine Web Platform für `127.0.0.1` hinzu oder nutze `localhost`.

## Referenzen

- Appwrite Next.js Quickstart: https://appwrite.io/docs/products/sites/quick-start/nextjs
- Appwrite Sites Quickstart: https://appwrite.io/docs/products/sites/quick-start
- Appwrite Sites Build Settings: https://appwrite.io/docs/products/sites/develop
- Appwrite CLI Sites Deployment: https://appwrite.io/docs/products/sites/deploy-from-cli
