export type SyncStatus = "idle" | "saving" | "error";

export type SyncFailure = { label: string; detail: string };

export type QueueEntry<T> = { id: string; label: string; op: T };

export type SyncQueue<T> = {
  // Lädt gespeicherte Einträge einer früheren Sitzung an den Anfang der Queue.
  hydrate: (entries: QueueEntry<T>[]) => void;
  push: (label: string, op: T) => void;
  retry: () => void;
  // Verwirft den fehlgeschlagenen Kopf der Queue und fährt mit dem Rest fort.
  discardCurrent: () => void;
  // Läuft, bis die Queue leer ist oder ein Job fehlschlägt.
  flush: () => Promise<void>;
  clear: () => void;
  pendingCount: () => number;
};

// Serialisiert alle Schreibzugriffe in Reihenfolge. Die Operationen sind reine
// Daten (kein Closure), damit `save` sie z. B. in localStorage sichern kann
// und sie einen Reload überleben. Schlägt ein Job fehl, bleibt er samt
// Nachfolgern in der Queue und kann per retry() erneut laufen.
//
// Jeder Eintrag trägt eine eindeutige ID, und `save` bekommt zusätzlich alle
// IDs, die dieser Queue-Instanz je gehört haben — damit kann die Persistenz
// Einträge fremder Tabs erhalten, statt sie zu überschreiben.
export function createSyncQueue<T>({
  execute,
  save,
  onChange,
}: {
  execute: (op: T) => Promise<void>;
  save: (entries: QueueEntry<T>[], ownedIds: ReadonlySet<string>) => void;
  onChange: (status: SyncStatus, failure: SyncFailure | null, pendingCount: number) => void;
}): SyncQueue<T> {
  const queue: QueueEntry<T>[] = [];
  // Alle je verwalteten Eintrags-IDs (auch erledigte/verworfene) — die
  // Persistenz entfernt nur diese aus dem gemeinsamen Speicher.
  const ownedIds = new Set<string>();
  let isRunning = false;
  let waiters: Array<() => void> = [];

  function notify(status: SyncStatus, failure: SyncFailure | null) {
    onChange(status, failure, queue.length);
  }

  function persistEntries() {
    save([...queue], ownedIds);
  }

  function settleWaiters() {
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) {
      resolve();
    }
  }

  async function run() {
    if (isRunning) return;
    isRunning = true;
    notify("saving", null);

    while (queue.length) {
      const next = queue[0];
      try {
        await execute(next.op);
        queue.shift();
        persistEntries();
      } catch (error) {
        isRunning = false;
        const detail =
          error instanceof Error && error.message
            ? error.message
            : "Unbekannter Fehler.";
        notify("error", { label: next.label, detail });
        settleWaiters();
        return;
      }
    }

    isRunning = false;
    notify("idle", null);
    settleWaiters();
  }

  return {
    hydrate(entries) {
      if (!entries.length) return;
      for (const entry of entries) {
        ownedIds.add(entry.id);
      }
      queue.unshift(...entries);
      persistEntries();
      if (!isRunning) {
        notify("idle", null);
      }
    },
    push(label, op) {
      const entry = { id: createEntryId(), label, op };
      ownedIds.add(entry.id);
      queue.push(entry);
      persistEntries();
      void run();
    },
    retry() {
      void run();
    },
    discardCurrent() {
      if (isRunning || !queue.length) return;
      queue.shift();
      persistEntries();
      if (queue.length) {
        void run();
      } else {
        notify("idle", null);
      }
    },
    flush() {
      if (!queue.length && !isRunning) {
        return Promise.resolve();
      }
      const done = new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
      void run();
      return done;
    },
    clear() {
      queue.length = 0;
      persistEntries();
      if (!isRunning) {
        notify("idle", null);
      }
    },
    pendingCount: () => queue.length,
  };
}

function createEntryId() {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
