#!/usr/bin/env node
// Legt Datenbank, Collections und Attribute für Rote Agenda in Appwrite an.
// Idempotent: Bereits vorhandene Ressourcen werden übersprungen.
//
// Voraussetzung: Ein Appwrite-API-Key mit allen Scopes der Kategorie
// "Databases" (databases.*, collections.*, attributes.* – jeweils read und
// write). Anlegen: Appwrite Console → Overview → Integrations → API keys.
//
// Nutzung:
//   APPWRITE_API_KEY=... node scripts/setup-appwrite.mjs
//   node scripts/setup-appwrite.mjs --key=<api-key>
//
// Optional: --endpoint=... --project=... --database=... --no-env-write

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? "true"] : [arg, "true"];
  }),
);

const ENDPOINT = (args.endpoint ?? process.env.APPWRITE_ENDPOINT ?? "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
const PROJECT_ID = args.project ?? process.env.APPWRITE_PROJECT_ID ?? "6a3bbc6600236e6bf22a";
const DATABASE_ID = args.database ?? process.env.APPWRITE_DATABASE_ID ?? "roteagenda";
const API_KEY = args.key ?? process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error(
    "Fehlender API-Key. Setze APPWRITE_API_KEY oder übergib --key=<api-key>.\n" +
      "Key anlegen: Appwrite Console → Overview → Integrations → API keys\n" +
      "(Scopes: alle unter der Kategorie Databases anhaken)",
  );
  process.exit(1);
}

const string = (key, size, required = true, array = false) => ({
  kind: "string",
  key,
  size,
  required,
  array,
});
const boolean = (key, required = true) => ({ kind: "boolean", key, required });
const integer = (key, required = true) => ({ kind: "integer", key, required });
const float = (key, required = true) => ({ kind: "float", key, required });

// Textfelder, die leer sein dürfen, sind bewusst optional –
// die App validiert Pflichtfelder clientseitig.
const COLLECTIONS = [
  {
    id: "projects",
    attributes: [
      string("id", 64),
      string("title", 256),
      string("description", 4096, false),
      string("keywords", 64, false, true),
      string("color", 16, false),
      integer("progress"),
      boolean("aiEnabled"),
      string("createdAt", 32),
      string("updatedAt", 32),
    ],
  },
  {
    id: "tasks",
    attributes: [
      string("id", 64),
      string("title", 256),
      string("description", 4096, false),
      string("projectId", 64),
      string("status", 16),
      string("priority", 16),
      string("dueDate", 16, false),
      string("sourceNoteId", 64, false),
      string("createdBy", 8),
      string("googleSynced", 16, false),
      string("createdAt", 32),
      string("updatedAt", 32),
    ],
  },
  {
    id: "rawNotes",
    attributes: [
      string("id", 64),
      string("content", 8192),
      boolean("processed"),
      string("createdAt", 32),
    ],
  },
  {
    id: "suggestions",
    attributes: [
      string("id", 64),
      string("rawNoteId", 64),
      string("suggestedTitle", 256),
      string("suggestedDescription", 4096, false),
      string("suggestedProjectId", 64, false),
      string("suggestedNewProjectTitle", 128, false),
      float("confidence"),
      string("priority", 16),
      string("dueDate", 16, false),
      string("reasoning", 4096, false),
      boolean("needsReview"),
      string("state", 16),
      string("createdAt", 32),
    ],
  },
];

async function api(method, path, body) {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload.message ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.type = payload.type;
    throw error;
  }

  return payload;
}

async function resourceExists(path) {
  try {
    await api("GET", path);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

// Prüft zuerst per GET, ob die Ressource existiert – manche Appwrite-Pläne
// melden sonst beim doppelten Anlegen ein Plan-Limit statt eines Konflikts.
async function ensure(label, { checkPath, create }) {
  try {
    if (checkPath && (await resourceExists(checkPath))) {
      console.log(`  · ${label} existiert bereits`);
      return;
    }

    await create();
    console.log(`  ✓ ${label} angelegt`);
  } catch (error) {
    if (error.status === 409) {
      console.log(`  · ${label} existiert bereits`);
    } else {
      throw new Error(`${label}: ${error.message}`);
    }
  }
}

async function listAttributeKeys(collectionId) {
  const { attributes } = await api(
    "GET",
    `/databases/${DATABASE_ID}/collections/${collectionId}/attributes`,
  );
  return new Set(attributes.map((attribute) => attribute.key));
}

async function createAttribute(collectionId, attribute) {
  const base = `/databases/${DATABASE_ID}/collections/${collectionId}/attributes`;
  const { kind, key, size, required, array } = attribute;

  if (kind === "string") {
    return api("POST", `${base}/string`, { key, size, required, array });
  }
  if (kind === "boolean") {
    return api("POST", `${base}/boolean`, { key, required });
  }
  if (kind === "integer") {
    return api("POST", `${base}/integer`, { key, required });
  }
  return api("POST", `${base}/float`, { key, required });
}

async function waitForAttributes(collectionId) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const { attributes } = await api(
      "GET",
      `/databases/${DATABASE_ID}/collections/${collectionId}/attributes`,
    );
    const pending = attributes.filter((attribute) => attribute.status !== "available");

    if (!pending.length) return;
    if (pending.some((attribute) => attribute.status === "failed")) {
      throw new Error(
        `Attribute in "${collectionId}" fehlgeschlagen: ${pending
          .filter((attribute) => attribute.status === "failed")
          .map((attribute) => attribute.key)
          .join(", ")}`,
      );
    }

    await new Promise((resolvePause) => setTimeout(resolvePause, 1000));
  }

  throw new Error(`Attribute in "${collectionId}" wurden nicht rechtzeitig aktiv.`);
}

function writeEnvFile() {
  const envPath = resolve(process.cwd(), ".env.local");
  const values = {
    NEXT_PUBLIC_APPWRITE_ENDPOINT: ENDPOINT,
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_APPWRITE_DATABASE_ID: DATABASE_ID,
    NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID: "projects",
    NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID: "tasks",
    NEXT_PUBLIC_APPWRITE_RAW_NOTES_COLLECTION_ID: "rawNotes",
    NEXT_PUBLIC_APPWRITE_SUGGESTIONS_COLLECTION_ID: "suggestions",
  };

  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const kept = lines.filter((line) => {
    const key = line.split("=")[0];
    return !(key in values);
  });
  const updated = [
    ...kept,
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
  ];

  writeFileSync(envPath, `${updated.join("\n")}\n`, "utf8");
  console.log(`\n.env.local aktualisiert (${envPath})`);
}

console.log(`Appwrite-Setup für Projekt ${PROJECT_ID} auf ${ENDPOINT}\n`);

console.log("Datenbank:");
await ensure(`Datenbank "${DATABASE_ID}"`, {
  checkPath: `/databases/${DATABASE_ID}`,
  create: async () => {
    try {
      await api("POST", "/databases", { databaseId: DATABASE_ID, name: "Rote Agenda" });
    } catch (error) {
      if (typeof error.message === "string" && error.message.includes("maximum number of databases")) {
        error.message +=
          " – Tipp: Der Free-Plan erlaubt nur eine Datenbank. Nutze eine vorhandene mit --database=<id> oder lösche die alte in der Console.";
      }
      throw error;
    }
  },
});

for (const collection of COLLECTIONS) {
  console.log(`\nCollection "${collection.id}":`);
  await ensure(`Collection "${collection.id}"`, {
    checkPath: `/databases/${DATABASE_ID}/collections/${collection.id}`,
    create: () =>
      api("POST", `/databases/${DATABASE_ID}/collections`, {
        collectionId: collection.id,
        name: collection.id,
        // Angemeldete Nutzer dürfen Dokumente anlegen; Lesen/Ändern/Löschen
        // regelt die App pro Dokument über Document Security.
        permissions: ['create("users")'],
        documentSecurity: true,
      }),
  });

  const existingAttributes = await listAttributeKeys(collection.id);
  for (const attribute of collection.attributes) {
    if (existingAttributes.has(attribute.key)) {
      console.log(`  · Attribut ${collection.id}.${attribute.key} existiert bereits`);
      continue;
    }

    await ensure(`Attribut ${collection.id}.${attribute.key}`, {
      create: () => createAttribute(collection.id, attribute),
    });
  }

  await waitForAttributes(collection.id);
  console.log(`  ✓ Alle Attribute von "${collection.id}" sind aktiv`);
}

if (args["no-env-write"] !== "true") {
  writeEnvFile();
}

console.log(`
Fertig. Nächste Schritte:
  1. Appwrite Console → Auth → E-Mail/Passwort aktivieren (falls noch nicht).
  2. Appwrite Console → Overview → Platforms: "localhost" und die
     Produktions-Domain (z. B. roteagenda.appwrite.network) als Web-Plattform.
  3. Mindestens einen KI-Provider-Key in .env.local eintragen (siehe .env.example).
  4. npm run dev und unter http://localhost:3000 registrieren.
`);
