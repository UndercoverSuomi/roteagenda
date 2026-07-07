// Lokale Persistenz für den Offline-Betrieb: der zuletzt geladene Datenstand
// und die Warteschlange noch nicht synchronisierter Schreibzugriffe.
// Beides ist an den Nutzer gebunden und wird beim Abmelden gelöscht.

import type { SyncOp } from "@/lib/appwrite-store";
import type { QueueEntry } from "@/lib/sync-queue";
import type { AppData } from "@/lib/types";

const CACHE_KEY = "rote-agenda-cache";
const QUEUE_KEY = "rote-agenda-queue";

export type CachedAppData = { userId: string; savedAt: string; data: AppData };
export type StoredQueue = { userId: string; entries: QueueEntry<SyncOp>[] };

export function readCachedAppData(): CachedAppData | null {
  const value = readJson(CACHE_KEY);
  if (!isRecord(value)) return null;
  if (typeof value.userId !== "string" || !value.userId) return null;
  if (!isRecord(value.data)) return null;

  const data = value.data;
  const listsOk = ["projects", "tasks", "rawNotes", "suggestions"].every((key) =>
    Array.isArray(data[key]),
  );
  if (!listsOk || !isRecord(data.user) || !isRecord(data.settings)) return null;

  return {
    userId: value.userId,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
    data: data as unknown as AppData,
  };
}

export function writeCachedAppData(userId: string, data: AppData) {
  writeJson(CACHE_KEY, {
    userId,
    savedAt: new Date().toISOString(),
    data,
  } satisfies CachedAppData);
}

export function clearCachedAppData() {
  removeKey(CACHE_KEY);
}

export function readQueuedOps(): StoredQueue | null {
  const value = readJson(QUEUE_KEY);
  if (!isRecord(value)) return null;
  if (typeof value.userId !== "string" || !value.userId) return null;
  if (!Array.isArray(value.entries)) return null;

  const entries = value.entries.filter(
    (entry): entry is QueueEntry<SyncOp> =>
      isRecord(entry) &&
      typeof entry.label === "string" &&
      isRecord(entry.op) &&
      typeof entry.op.kind === "string",
  );

  return { userId: value.userId, entries };
}

export function writeQueuedOps(userId: string, entries: QueueEntry<SyncOp>[]) {
  writeJson(QUEUE_KEY, { userId, entries } satisfies StoredQueue);
}

export function clearQueuedOps() {
  removeKey(QUEUE_KEY);
}

// Unterscheidet Verbindungsfehler von echten API-Fehlern (z. B. 401),
// damit die App offline auf den Cache ausweichen kann.
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true; // fetch wirft TypeError ("Failed to fetch")

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|fetch failed|network|load failed/i.test(message);
}

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ohne localStorage (oder bei vollem Speicher) arbeitet die App
    // rein im Arbeitsspeicher weiter.
  }
}

function removeKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Siehe writeJson.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
