"use client";

import { CalendarPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addEventToGoogleCalendar,
  addTaskToGoogleTasks,
  buildCalendarTemplateUrl,
  isGoogleConfigured,
  preloadGoogleIdentity,
} from "@/lib/google";
import type { Translator } from "@/lib/i18n";
import type { GoogleSyncTarget, Task } from "@/lib/types";

export function GoogleSection({
  task,
  t,
  onSynced,
}: {
  task: Task;
  t: Translator;
  onSynced: (target: GoogleSyncTarget) => void;
}) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  // Nach einer bereits gespeicherten Übertragung lässt sich der Button
  // bewusst erneut einblenden ("Erneut übertragen").
  const [showAgain, setShowAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDate = Boolean(task.dueDate);

  useEffect(() => {
    void preloadGoogleIdentity().catch(() => undefined);
  }, []);

  async function handleTransfer() {
    setError(null);

    // Ohne Client-ID öffnet der Kalender-Weg die offizielle Vorbefüll-Seite;
    // ob der Termin dort bestätigt wird, wissen wir nicht — kein Sync-Status.
    if (hasDate && !isGoogleConfigured) {
      window.open(
        buildCalendarTemplateUrl({
          title: task.title,
          description: task.description,
          start: task.dueDate as string,
        }),
        "_blank",
        "noopener",
      );
      return;
    }

    setState("working");
    try {
      const target: GoogleSyncTarget = hasDate ? "calendar" : "tasks";
      if (hasDate) {
        await addEventToGoogleCalendar({
          title: task.title,
          description: task.description,
          start: task.dueDate as string,
        });
      } else {
        await addTaskToGoogleTasks({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
        });
      }
      setState("done");
      setShowAgain(false);
      onSynced(target);
    } catch (transferError) {
      setState("idle");
      setError(
        t("google.error", {
          detail:
            transferError instanceof Error && transferError.message
              ? transferError.message
              : "?",
        }),
      );
    }
  }

  // Frisch übertragen zählt vor dem gespeicherten Status (z. B. nach "Erneut übertragen").
  const syncedTarget: GoogleSyncTarget | null =
    state === "done" ? (hasDate ? "calendar" : "tasks") : task.googleSynced;

  return (
    <section>
      <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        Google
      </h2>
      {!hasDate && !isGoogleConfigured ? (
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          {t("google.tasksNotConfigured")}
        </p>
      ) : syncedTarget && !showAgain ? (
        <div className="mt-2">
          <p className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px] font-bold text-[var(--green-2)]">
            {syncedTarget === "calendar" ? t("google.doneCalendar") : t("google.doneTasks")}
          </p>
          <button
            type="button"
            onClick={() => setShowAgain(true)}
            className="mt-2 text-[12px] font-bold text-[var(--muted)] underline underline-offset-2"
          >
            {t("google.sendAgain")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleTransfer()}
          disabled={state === "working"}
          className="mt-2 flex items-center gap-2 rounded-[5px] border border-[var(--line-strong)] px-4 py-3 text-[13px] font-bold disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" />
          {state === "working"
            ? t("google.working")
            : hasDate
              ? t("google.addToCalendar")
              : t("google.addToTasks")}
        </button>
      )}
      {error ? (
        <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
