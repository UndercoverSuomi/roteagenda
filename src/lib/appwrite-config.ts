export const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";

export const APPWRITE_PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "6a3bbc6600236e6bf22a";

// Die Defaults entsprechen den IDs, die scripts/setup-appwrite.mjs anlegt.
// Environment Variables sind nur noch nötig, wenn davon abgewichen wird.
export const APPWRITE_DATABASE_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "roteagenda";

export const APPWRITE_COLLECTIONS = {
  projects: process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID || "projects",
  tasks: process.env.NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID || "tasks",
  // App-seitig heißen sie Notizen; die Collection behält aus
  // Kompatibilitätsgründen die historische ID "rawNotes".
  notes: process.env.NEXT_PUBLIC_APPWRITE_RAW_NOTES_COLLECTION_ID || "rawNotes",
  suggestions:
    process.env.NEXT_PUBLIC_APPWRITE_SUGGESTIONS_COLLECTION_ID || "suggestions",
};
