import { ChevronRight, Plus, Tags } from "lucide-react";
import { projectProgress } from "@/components/app-helpers";
import { ProgressBar } from "@/components/ui/primitives";
import type { Translator } from "@/lib/i18n";
import type { AppData, Project } from "@/lib/types";

export function DesktopInsightPanel({
  data,
  selectedProject,
  t,
  onCapture,
  onOpenInbox,
}: {
  data: AppData;
  selectedProject?: Project;
  t: Translator;
  onCapture: () => void;
  onOpenInbox: () => void;
}) {
  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const pending = data.suggestions.filter((suggestion) => suggestion.state === "pending");
  const projectTasks = selectedProject
    ? data.tasks.filter((task) => task.projectId === selectedProject.id)
    : [];

  return (
    <aside className="sticky top-6 hidden space-y-4 md:block">
      <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {t("insight.focus")}
        </p>
        <h2 className="mt-3 font-display text-[26px] font-bold">
          {t(openTasks.length === 1 ? "insight.openTasks.one" : "insight.openTasks.many", {
            count: openTasks.length,
          })}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          {t("insight.philosophy")}
        </p>
        <button
          type="button"
          onClick={onCapture}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--green)] px-4 py-3 text-[13px] font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          {t("insight.newNote")}
        </button>
      </section>

      {selectedProject ? (
        <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
                {t("insight.activeProject")}
              </p>
              <h2 className="mt-3 font-display text-[23px] font-bold">
                {selectedProject.title}
              </h2>
            </div>
            <Tags className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <ProgressBar value={projectProgress(selectedProject, projectTasks)} className="mt-5" />
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            {t(
              projectTasks.filter((task) => task.status !== "done").length === 1
                ? "insight.openTasks.one"
                : "insight.openTasks.many",
              { count: projectTasks.filter((task) => task.status !== "done").length },
            )}
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onOpenInbox}
        className="flex w-full items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left"
      >
        <span>
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
            {t("insight.aiReview")}
          </span>
          <span className="mt-2 block font-display text-[22px] font-bold">
            {t(pending.length === 1 ? "insight.pending.one" : "insight.pending.many", {
              count: pending.length,
            })}
          </span>
        </span>
        <ChevronRight className="h-5 w-5" />
      </button>
    </aside>
  );
}
