export type SyncStatus = "idle" | "saving" | "error";

export type SyncFailure = { label: string; detail: string };

export type SyncQueue = {
  push: (label: string, job: () => Promise<void>) => void;
  retry: () => void;
  pendingCount: () => number;
};

// Serialisiert alle Schreibzugriffe in Reihenfolge. Schlägt ein Job fehl,
// bleibt er samt Nachfolgern in der Queue und kann per retry() erneut laufen.
export function createSyncQueue(
  onChange: (status: SyncStatus, failure: SyncFailure | null) => void,
): SyncQueue {
  type QueuedJob = { label: string; job: () => Promise<void> };

  const queue: QueuedJob[] = [];
  let isRunning = false;

  async function run() {
    if (isRunning) return;
    isRunning = true;
    onChange("saving", null);

    while (queue.length) {
      const next = queue[0];
      try {
        await next.job();
        queue.shift();
      } catch (error) {
        isRunning = false;
        const detail =
          error instanceof Error && error.message
            ? error.message
            : "Unbekannter Fehler.";
        onChange("error", { label: next.label, detail });
        return;
      }
    }

    isRunning = false;
    onChange("idle", null);
  }

  return {
    push(label, job) {
      queue.push({ label, job });
      void run();
    },
    retry() {
      void run();
    },
    pendingCount: () => queue.length,
  };
}
