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

// Gegenstück zu restoreNullableFields: null-Felder werden nicht an
// Appwrite geschickt (optionale Attribute), sondern beim Lesen wieder
// als Defaults ergänzt.
export function toAppwriteData<T extends StoredItem>(item: T) {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== null),
  ) as Record<string, unknown>;
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
    data.description ??= "";
    // Ohne Default würde ein unbewachter .map()-Zugriff auf Altdaten crashen.
    data.keywords ??= [];
  }

  if (key === "tasks") {
    data.description ??= "";
    data.dueDate ??= null;
    data.sourceNoteId ??= null;
    data.googleSynced ??= null;
  }

  if (key === "notes") {
    // Bestandsnotizen aus der Capture-Ära bekommen die neuen Felder als Defaults.
    data.title ??= "";
    data.enhanced ??= "";
    data.tags ??= [];
    data.projectId ??= null;
    data.relatedNoteIds ??= [];
    data.source ??= "capture";
    data.sourceUrl ??= null;
    data.pinned ??= false;
    data.pendingFileId ??= null;
    data.processingError ??= null;
    data.mediaFileId ??= null;
    data.updatedAt ??= data.createdAt ?? "";
  }

  if (key === "suggestions") {
    data.kind ??= "task";
    data.suggestedDescription ??= "";
    data.suggestedProjectId ??= null;
    data.suggestedNewProjectTitle ??= null;
    data.dueDate ??= null;
    data.eventStart ??= null;
    data.eventEnd ??= null;
    data.reasoning ??= "";
  }

  return data;
}
