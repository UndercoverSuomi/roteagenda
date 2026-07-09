// Wendet Appwrite-Realtime-Events auf den lokalen App-Zustand an.
// Pure Funktion mit relativen Imports, damit der Node-Test-Runner sie lädt.

import {
  collectionKeyForId,
  documentToItem,
  type StoredItem,
} from "./appwrite-documents.ts";
import type { AppData } from "./types.ts";

export function applyRealtimeEvent(
  data: AppData,
  events: string[],
  payload: unknown,
): AppData {
  if (!isRecord(payload) || typeof payload.$collectionId !== "string") return data;

  const key = collectionKeyForId(payload.$collectionId);
  if (!key) return data;

  const item = documentToItem<StoredItem>(key, payload);
  if (typeof item.id !== "string" || !item.id) return data;

  // Die vier Collection-Keys heißen exakt wie die Listenfelder in AppData.
  const list = data[key] as unknown as StoredItem[];
  const index = list.findIndex((existing) => existing.id === item.id);
  const isDelete = events.some((event) => event.endsWith(".delete"));

  if (isDelete) {
    if (index === -1) return data;
    return {
      ...data,
      [key]: list.filter((existing) => existing.id !== item.id),
    } as AppData;
  }

  if (index === -1) {
    return { ...data, [key]: [item, ...list] } as AppData;
  }

  // Echo der eigenen Schreibzugriffe: unverändert → gleiche Referenz zurück.
  // Der Vergleich muss die Schlüssel-Reihenfolge ignorieren, weil lokal
  // gebaute Objekte und Appwrite-Dokumente ihre Felder anders ordnen.
  if (stableStringify(list[index]) === stableStringify(item)) return data;

  const nextList = [...list];
  nextList[index] = item;
  return { ...data, [key]: nextList } as AppData;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeysDeep(value[key])]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
