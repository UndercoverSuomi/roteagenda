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
import type { Task } from "@/lib/types";

export function GoogleSection({ task, t }: { task: Task; t: Translator }) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const hasDate = Boolean(task.dueDate);

  useEffect(() => {
    void preloadGoogleIdentity().catch(() => undefined);
  }, []);

  async function handleTransfer() {
    setError(null);

    // Ohne Client-ID öffnet der Kalender-Weg die offizielle Vorbefüll-Seite.
    if (hasDate && !isGoogleConfigured) {
      window.open(
        buildCalendarTemplateUrl({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate as string,
        }),
        "_blank",
        "noopener",
      );
      return;
    }

    setState("working");
    try {
      if (hasDate) {
        await addEventToGoogleCalendar({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate as string,
        });
      } else {
        await addTaskToGoogleTasks({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
        });
      }
      setState("done");
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

  return (
    <section>
      <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        Google
      </h2>
      {!hasDate && !isGoogleConfigured ? (
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          {t("google.tasksNotConfigured")}
        </p>
      ) : state === "done" ? (
        <p className="mt-2 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px] font-bold text-[var(--green-2)]">
          {hasDate ? t("google.doneCalendar") : t("google.doneTasks")}
        </p>
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
