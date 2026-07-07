// Pure Umwandlung zwischen Appwrite-Dokumenten und App-Objekten.
// Bewusst ohne Appwrite-Client-Import, damit Node-Tests (Realtime-Reducer)
// die Logik direkt laden können.

import { APPWRITE_COLLECTIONS } from "./appwrite-config.ts";
import { colorForId } from "./project-colors.ts";

export type CollectionKey = keyof typeof APPWRITE_COLLECTIONS;
export type StoredItem = { id: string };

export function collectionKeyForId(collectionId: string): CollectionKey | null {
  const entry = Object.entries(APPWRITE_COLLECTIONS).find(
    ([, id]) => id === collectionId,
  );
  return (entry?.[0] as CollectionKey | undefined) ?? null;
}

export function documentToItem<T = Record<string, unknown>>(
  key: CollectionKey,
  document: Record<string, unknown>,
): T {
  return restoreNullableFields(key, stripDocumentMetadata(document)) as T;
}

function stripDocumentMetadata(document: Record<string, unknown>) {
  const data = { ...document };

  delete data.$id;
  delete data.$sequence;
  delete data.$collectionId;
  delete data.$databaseId;
  delete data.$createdAt;
  delete data.$updatedAt;
  delete data.$permissions;

  return data;
}

function restoreNullableFields(key: CollectionKey, item: Record<string, unknown>) {
  const data = { ...item };

  if (key === "projects") {
    // Bestandsprojekte ohne gespeicherte Farbe bekommen eine stabile Standardfarbe.
    data.color ??= colorForId(String(data.id ?? ""));
  }

  if (key === "tasks") {
    data.dueDate ??= null;
    data.sourceNoteId ??= null;
    data.googleSynced ??= null;
  }

  if (key === "suggestions") {
    data.suggestedProjectId ??= null;
    data.suggestedNewProjectTitle ??= null;
    data.dueDate ??= null;
  }

  return data;
}
