export const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "https://fra.cloud.appwrite.io/v1";

export const APPWRITE_PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "6a3bbc6600236e6bf22a";

export const APPWRITE_DATABASE_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? "";

export const APPWRITE_COLLECTIONS = {
  projects: process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID ?? "",
  tasks: process.env.NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID ?? "",
  rawNotes: process.env.NEXT_PUBLIC_APPWRITE_RAW_NOTES_COLLECTION_ID ?? "",
  suggestions: process.env.NEXT_PUBLIC_APPWRITE_SUGGESTIONS_COLLECTION_ID ?? "",
  tags: process.env.NEXT_PUBLIC_APPWRITE_TAGS_COLLECTION_ID ?? "",
};

export function getMissingAppwriteCollectionEnv() {
  const missing = [];

  if (!APPWRITE_DATABASE_ID) missing.push("NEXT_PUBLIC_APPWRITE_DATABASE_ID");

  for (const [key, value] of Object.entries(APPWRITE_COLLECTIONS)) {
    if (!value) {
      missing.push(`NEXT_PUBLIC_APPWRITE_${toEnvSegment(key)}_COLLECTION_ID`);
    }
  }

  return missing;
}

function toEnvSegment(key: string) {
  return key.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase();
}
