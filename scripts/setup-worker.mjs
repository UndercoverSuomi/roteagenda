#!/usr/bin/env node
// Legt die Appwrite Function "process-note" (Notiz-Worker) an bzw.
// aktualisiert sie und deployt das gebündelte Worker-Paket.
// Idempotent — kann nach jeder Worker-Änderung erneut laufen.
//
// Voraussetzung: `npm run build:worker` wurde ausgeführt (dist/main.js).
// API-Key-Scopes: Functions (alle, read+write) und Users (read) zum
// Anlegen; die Function selbst bekommt eigene Scopes (siehe unten).
//
// Nutzung:
//   node scripts/setup-worker.mjs --key=<api-key>
// Optional: --endpoint=... --project=... --timeout=300 --runtime=node-22

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? "true"] : [arg, "true"];
  }),
);

const ENDPOINT = (args.endpoint ?? process.env.APPWRITE_ENDPOINT ?? "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
const PROJECT_ID = args.project ?? process.env.APPWRITE_PROJECT_ID ?? "6a3bbc6600236e6bf22a";
const API_KEY = args.key ?? process.env.APPWRITE_API_KEY;
const FUNCTION_ID = "process-note";
const TIMEOUT = Number(args.timeout ?? 300);
const DATABASE_ID = "roteagenda";
const NOTES_COLLECTION_ID = "rawNotes";

if (!API_KEY) {
  console.error("Fehlender API-Key. Nutzung: node scripts/setup-worker.mjs --key=<api-key>");
  process.exit(1);
}

const distPath = resolve("functions/process-note/dist/main.js");
if (!existsSync(distPath)) {
  console.error("functions/process-note/dist/main.js fehlt — zuerst `npm run build:worker` ausführen.");
  process.exit(1);
}

async function api(method, path, body, form) {
  const headers = {
    "X-Appwrite-Project": PROJECT_ID,
    "X-Appwrite-Key": API_KEY,
  };
  if (!form) headers["Content-Type"] = "application/json";

  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.message ?? `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

// ── Runtime wählen ────────────────────────────────────────────────────
// GET /functions/runtimes ist auf Appwrite Cloud (1.9.x) Console-only und
// antwortet API-Keys mit 401 — dann auf den Fallback bzw. --runtime ausweichen.
const FALLBACK_RUNTIME = "node-22";
let runtime = args.runtime;
if (!runtime) {
  try {
    const runtimes = (await api("GET", "/functions/runtimes")).runtimes ?? [];
    runtime = runtimes
      .map((entry) => entry.$id)
      .filter((id) => /^node-\d/.test(id))
      .sort((a, b) => parseFloat(b.slice(5)) - parseFloat(a.slice(5)))[0];
  } catch {
    runtime = FALLBACK_RUNTIME;
  }
  runtime ||= FALLBACK_RUNTIME;
}
console.log(`Runtime: ${runtime}`);

// ── Function anlegen/aktualisieren ───────────────────────────────────
const functionConfig = {
  name: "Notiz-Worker",
  runtime,
  entrypoint: "dist/main.js",
  commands: "npm install",
  timeout: TIMEOUT,
  enabled: true,
  logging: true,
  // Angemeldete Nutzer dürfen die Function direkt ausführen — die App
  // startet so die Graph-Tiefenanalyse (createExecution, async).
  execute: ['users'],
  // Die App legt Notizen über die Sync-Queue per Upsert an; Appwrite feuert
  // dafür .upsert-Events, die der Event-Validator für Function-Trigger
  // (Cloud 1.9.5) aber nicht akzeptiert. Deshalb alle Dokument-Events der
  // Collection abonnieren — der Worker filtert Delete/Echos selbst.
  events: [`databases.${DATABASE_ID}.collections.${NOTES_COLLECTION_ID}.documents.*`],
  scopes: [
    "users.read",
    "databases.read",
    "collections.read",
    "documents.read",
    "documents.write",
    "buckets.read",
    "files.read",
    "files.write",
  ],
};

let exists = true;
try {
  await api("GET", `/functions/${FUNCTION_ID}`);
} catch (error) {
  if (error.status === 404) exists = false;
  else throw error;
}

if (exists) {
  await api("PUT", `/functions/${FUNCTION_ID}`, functionConfig);
  console.log(`✓ Function "${FUNCTION_ID}" aktualisiert`);
} else {
  await api("POST", "/functions", { functionId: FUNCTION_ID, ...functionConfig });
  console.log(`✓ Function "${FUNCTION_ID}" angelegt`);
}

// ── Environment-Variablen setzen (aus .env.local übernehmen) ────────
const envPath = resolve(".env.local");
const envLines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
const localEnv = Object.fromEntries(
  envLines
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);

const wanted = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_VIDEO_MODEL",
  "OPENROUTER_VISION_MODEL",
  "OPENROUTER_TRANSCRIBE_MODEL",
].filter((key) => localEnv[key]);

if (!localEnv.OPENROUTER_API_KEY) {
  console.log("! OPENROUTER_API_KEY fehlt in .env.local — Variable manuell an der Function setzen.");
}

const existingVariables = (await api("GET", `/functions/${FUNCTION_ID}/variables`)).variables ?? [];
for (const key of wanted) {
  const existing = existingVariables.find((variable) => variable.key === key);
  if (existing) {
    await api("PUT", `/functions/${FUNCTION_ID}/variables/${existing.$id}`, {
      key,
      value: localEnv[key],
    });
    console.log(`  · Variable ${key} aktualisiert`);
  } else {
    // Appwrite 1.9+ verlangt eine explizite variableId ("unique()" generiert).
    await api("POST", `/functions/${FUNCTION_ID}/variables`, {
      variableId: "unique()",
      key,
      value: localEnv[key],
    });
    console.log(`  ✓ Variable ${key} gesetzt`);
  }
}

// ── Deployment hochladen und aktivieren ──────────────────────────────
// tar bewusst nur mit relativen Pfaden aufrufen: GNU tar unter Windows
// deutet absolute Pfade wie "C:\..." sonst als Remote-Host.
const tarName = `.worker-deploy-${Date.now()}.tar.gz`;
const tarPath = resolve(tarName);
const tar = spawnSync("tar", ["-czf", `../../${tarName}`, "package.json", "dist"], {
  cwd: resolve("functions/process-note"),
});
if (tar.status !== 0) {
  console.error("tar fehlgeschlagen:", tar.stderr?.toString());
  process.exit(1);
}

const form = new FormData();
form.append("code", new Blob([readFileSync(tarPath)], { type: "application/gzip" }), "code.tar.gz");
form.append("activate", "true");
unlinkSync(tarPath);

const deployment = await api("POST", `/functions/${FUNCTION_ID}/deployments`, null, form);
console.log(`✓ Deployment ${deployment.$id} hochgeladen — Build läuft...`);

// Auf den Build warten.
const deadline = Date.now() + 5 * 60_000;
let status = deployment.status;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000));
  const current = await api("GET", `/functions/${FUNCTION_ID}/deployments/${deployment.$id}`);
  if (current.status !== status) {
    status = current.status;
    console.log(`  · Status: ${status}`);
  }
  if (status === "ready") break;
  if (status === "failed") {
    console.error("Build fehlgeschlagen. Logs:");
    console.error(current.buildLogs ?? "(keine Logs)");
    process.exit(1);
  }
}

if (status !== "ready") {
  console.error("Build wurde nicht rechtzeitig fertig — Status in der Console prüfen.");
  process.exit(1);
}

console.log(`
Fertig. Der Notiz-Worker ist aktiv:
  - Trigger: neue Dokumente in "${NOTES_COLLECTION_ID}" (source url/image)
  - Timeout: ${TIMEOUT}s (asynchrone Ausführung)
  - Nach Änderungen an src/lib/(ai-server|web-content|...) gilt:
    npm run build:worker && node scripts/setup-worker.mjs --key=...
`);
