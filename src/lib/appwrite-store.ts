import { Permission, Query, Role, type Models } from "appwrite";
import { account, databases } from "@/lib/appwrite";
import {
  APPWRITE_COLLECTIONS,
  APPWRITE_DATABASE_ID,
} from "@/lib/appwrite-config";
import { DEFAULT_AI_MODEL_ID, isAiModelId } from "@/lib/ai-models";
import { isLocale, type Locale } from "@/lib/i18n";
import type {
  AiSuggestion,
  AppData,
  Project,
  RawNote,
  Task,
  User,
  UserSettings,
} from "@/lib/types";

type AppwriteUser = Models.User<Models.Preferences>;
type DocumentWithId<T> = T & Models.Document;
type CollectionKey = keyof typeof APPWRITE_COLLECTIONS;
type AppwritePrefs = Partial<UserSettings>;
type StoredItem = { id: string };

const PAGE_SIZE = 100;
// Sicherheitsgrenze gegen Endlosschleifen; weit über realistischen Datenmengen.
const MAX_DOCUMENTS = 5000;

export async function loadAppDataForUser(
  user: AppwriteUser,
  fallbackLocale: Locale = "de",
): Promise<AppData> {
  try {
    const [settings, projects, tasks, rawNotes, suggestions] = await Promise.all([
      readSettings(fallbackLocale),
      listAllDocuments<Project>("projects"),
      listAllDocuments<Task>("tasks"),
      listAllDocuments<RawNote>("rawNotes"),
      listAllDocuments<AiSuggestion>("suggestions"),
    ]);

    return {
      user: toAppUser(user),
      settings,
      projects,
      tasks,
      rawNotes,
      suggestions,
    };
  } catch (error) {
    throw new Error(describeLoadError(error));
  }
}

export async function saveSettings(settings: UserSettings) {
  await account.updatePrefs<AppwritePrefs>({ prefs: settings });
}

export async function upsertItem<T extends StoredItem>(
  key: CollectionKey,
  item: T,
  userId: string,
) {
  await databases.upsertDocument({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_COLLECTIONS[key],
    documentId: item.id,
    data: toAppwriteData(item),
    permissions: userDocumentPermissions(userId),
  });
}

export async function deleteItem(key: CollectionKey, id: string) {
  try {
    await databases.deleteDocument({
      databaseId: APPWRITE_DATABASE_ID,
      collectionId: APPWRITE_COLLECTIONS[key],
      documentId: id,
    });
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}

export async function deleteAllUserData() {
  const keys: CollectionKey[] = ["tasks", "suggestions", "rawNotes", "projects"];

  for (const key of keys) {
    const items = await listAllDocuments<StoredItem>(key);
    for (const item of items) {
      await deleteItem(key, item.id);
    }
  }
}

async function readSettings(fallbackLocale: Locale): Promise<UserSettings> {
  try {
    const prefs = await account.getPrefs<AppwritePrefs>();
    const aiModel =
      typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel)
        ? prefs.aiModel
        : DEFAULT_AI_MODEL_ID;
    const locale =
      typeof prefs.locale === "string" && isLocale(prefs.locale)
        ? prefs.locale
        : fallbackLocale;

    return { aiModel, locale };
  } catch {
    return { aiModel: DEFAULT_AI_MODEL_ID, locale: fallbackLocale };
  }
}

async function listAllDocuments<T>(key: CollectionKey): Promise<T[]> {
  const collectionId = APPWRITE_COLLECTIONS[key];
  const documents: DocumentWithId<T>[] = [];
  let cursor: string | null = null;

  while (documents.length < MAX_DOCUMENTS) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderDesc("$createdAt")];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const page = await databases.listDocuments<DocumentWithId<T>>({
      databaseId: APPWRITE_DATABASE_ID,
      collectionId,
      queries,
    });

    documents.push(...page.documents);
    if (page.documents.length < PAGE_SIZE) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }

  return documents.map((document) =>
    restoreNullableFields(key, stripDocumentMetadata<T>(document)),
  );
}

function describeLoadError(error: unknown) {
  const detail =
    error instanceof Error && error.message ? error.message : "Unbekannter Fehler.";

  return (
    "Die Appwrite-Daten konnten nicht geladen werden. Prüfe, ob Datenbank und " +
    "Collections existieren (node scripts/setup-appwrite.mjs) und der Hostname " +
    `unter Platforms im Appwrite-Projekt eingetragen ist. Details: ${detail}`
  );
}

function toAppUser(user: AppwriteUser): User {
  return {
    id: user.$id,
    name: user.name || user.email,
    email: user.email,
  };
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

function toAppwriteData<T extends StoredItem>(item: T) {
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

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 404
  );
}

function userDocumentPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
