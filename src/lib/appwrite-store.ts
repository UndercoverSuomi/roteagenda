import { Permission, Query, Role, type Models } from "appwrite";
import { account, databases } from "@/lib/appwrite";
import {
  APPWRITE_COLLECTIONS,
  APPWRITE_DATABASE_ID,
  getMissingAppwriteCollectionEnv,
} from "@/lib/appwrite-config";
import { DEFAULT_AI_MODEL_ID, isAiModelId } from "@/lib/ai-models";
import { createInitialData } from "@/lib/mock-data";
import type {
  AiSuggestion,
  AppData,
  Project,
  RawNote,
  Tag,
  Task,
  User,
  UserSettings,
} from "@/lib/types";

type AppwriteUser = Models.User<Models.Preferences>;
type DocumentWithId<T> = T & Models.Document;
type SyncItem = { id: string };
type CollectionKey = keyof typeof APPWRITE_COLLECTIONS;
type AppwritePrefs = Partial<UserSettings>;

export async function loadAppDataForUser(user: AppwriteUser): Promise<AppData> {
  assertAppwriteStoreConfigured();

  const [prefs, projects, tasks, rawNotes, suggestions, tags] = await Promise.all([
    readSettings(),
    listCollection<Project>("projects"),
    listCollection<Task>("tasks"),
    listCollection<RawNote>("rawNotes"),
    listCollection<AiSuggestion>("suggestions"),
    listCollection<Tag>("tags"),
  ]);

  const appUser = toAppUser(user);
  const hasRemoteData =
    projects.length || tasks.length || rawNotes.length || suggestions.length || tags.length;

  if (!hasRemoteData) {
    const seeded = {
      ...createInitialData(),
      user: appUser,
      settings: prefs,
    };
    await saveAppData(seeded);
    return seeded;
  }

  return {
    user: appUser,
    settings: prefs,
    projects,
    tasks,
    rawNotes,
    suggestions,
    tags,
  };
}

export async function saveAppData(data: AppData) {
  assertAppwriteStoreConfigured();

  await Promise.all([
    account.updatePrefs<AppwritePrefs>({ prefs: data.settings }),
    syncCollection("projects", data.projects, data.user.id),
    syncCollection("tasks", data.tasks, data.user.id),
    syncCollection("rawNotes", data.rawNotes, data.user.id),
    syncCollection("suggestions", data.suggestions, data.user.id),
    syncCollection("tags", data.tags, data.user.id),
  ]);
}

export function assertAppwriteStoreConfigured() {
  const missing = getMissingAppwriteCollectionEnv();

  if (missing.length) {
    throw new Error(
      `Appwrite ist noch nicht vollständig konfiguriert. Fehlende Environment Variables: ${missing.join(", ")}`,
    );
  }
}

function toAppUser(user: AppwriteUser): User {
  return {
    id: user.$id,
    name: user.name || user.email,
    email: user.email,
  };
}

async function readSettings(): Promise<UserSettings> {
  try {
    const prefs = await account.getPrefs<AppwritePrefs>();
    const aiModel = typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel)
      ? prefs.aiModel
      : DEFAULT_AI_MODEL_ID;

    return { aiModel };
  } catch {
    return { aiModel: DEFAULT_AI_MODEL_ID };
  }
}

async function listCollection<T>(key: CollectionKey): Promise<T[]> {
  const collectionId = APPWRITE_COLLECTIONS[key];
  const result = await databases.listDocuments<DocumentWithId<T>>({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId,
    queries: [Query.limit(100), Query.orderDesc("$updatedAt")],
  });

  return result.documents.map((document) =>
    restoreNullableFields(key, stripDocumentMetadata<T>(document)),
  );
}

async function syncCollection<T extends SyncItem>(
  key: CollectionKey,
  items: T[],
  userId: string,
) {
  const collectionId = APPWRITE_COLLECTIONS[key];
  const current = await databases.listDocuments<DocumentWithId<T>>({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId,
    queries: [Query.limit(100)],
  });
  const wantedIds = new Set(items.map((item) => item.id));

  await Promise.all([
    ...items.map((item) =>
      databases.upsertDocument({
        databaseId: APPWRITE_DATABASE_ID,
        collectionId,
        documentId: item.id,
        data: toAppwriteData(item),
        permissions: userDocumentPermissions(userId),
      }),
    ),
    ...current.documents
      .filter((document) => !wantedIds.has(document.id))
      .map((document) =>
        databases.deleteDocument({
          databaseId: APPWRITE_DATABASE_ID,
          collectionId,
          documentId: document.$id,
        }),
      ),
  ]);
}

function stripDocumentMetadata<T>(document: DocumentWithId<T>): T {
  const data = { ...document } as Record<string, unknown>;

  delete data.$id;
  delete data.$sequence;
  delete data.$collectionId;
  delete data.$databaseId;
  delete data.$createdAt;
  delete data.$updatedAt;
  delete data.$permissions;

  return data as T;
}

function toAppwriteData<T extends SyncItem>(item: T) {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== null),
  ) as Record<string, unknown>;
}

function restoreNullableFields<T>(key: CollectionKey, item: T): T {
  const data = { ...(item as Record<string, unknown>) };

  if (key === "tasks") {
    data.dueDate ??= null;
    data.sourceNoteId ??= null;
  }

  if (key === "suggestions") {
    data.suggestedProjectId ??= null;
    data.suggestedNewProjectTitle ??= null;
    data.dueDate ??= null;
  }

  return data as T;
}

function userDocumentPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
