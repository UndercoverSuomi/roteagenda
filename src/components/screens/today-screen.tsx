"use client";

import { Bell, ChevronRight, Menu, Plus, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { AiStats, TaskFilter } from "@/components/app-types";
import { TaskTabs } from "@/components/ui/controls";
import { EmptyState, ScreenHeader } from "@/components/ui/primitives";
import { TaskRow } from "@/components/ui/task-items";
import type { Locale, Translator } from "@/lib/i18n";
import type { Project, Task } from "@/lib/types";

type TaskGroup = { project: Project | undefined; tasks: Task[] };

export function TodayScreen({
  tasks,
  projects,
  filter,
  aiStats,
  locale,
  t,
  onFilterChange,
  onOpenTask,
  onOpenProject,
  onToggleTask,
  onCapture,
  onOpenInbox,
  onOpenMore,
}: {
  tasks: Task[];
  projects: Map<string, Project>;
  filter: TaskFilter;
  aiStats: AiStats;
  locale: Locale;
  t: Translator;
  onFilterChange: (filter: TaskFilter) => void;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCapture: () => void;
  onOpenInbox: () => void;
  onOpenMore: () => void;
}) {
  const isBrandNew = !tasks.length && !aiStats.processedNotes && filter === "all";

  // Aufgaben nach Projekt bündeln; Gruppen nach dringlichster offener
  // Aufgabe sortieren (Reihenfolge innerhalb der Gruppe bleibt erhalten).
  const groups = useMemo<TaskGroup[]>(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = byProject.get(task.projectId);
      if (list) {
        list.push(task);
      } else {
        byProject.set(task.projectId, [task]);
      }
    }

    const rankOf = (group: TaskGroup) => {
      const firstOpen = group.tasks.find((task) => task.status !== "done");
      if (!firstOpen) return "9999-99-99";
      return firstOpen.dueDate ?? "9999-99-98";
    };

    return Array.from(byProject.entries())
      .map(([projectId, groupTasks]) => ({
        project: projects.get(projectId),
        tasks: groupTasks,
      }))
      .sort(
        (a, b) =>
          rankOf(a).localeCompare(rankOf(b)) ||
          (a.project?.title ?? "").localeCompare(b.project?.title ?? ""),
      );
  }, [tasks, projects]);

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("today.title")}
        leftIcon={<Menu className="h-6 w-6" />}
        rightIcon={<Bell className="h-5 w-5" />}
        leftLabel={t("today.openMore")}
        rightLabel={t("today.openInbox")}
        onLeft={onOpenMore}
        onRight={onOpenInbox}
      />

      <button
        type="button"
        onClick={onCapture}
        className="mt-6 flex h-[68px] items-center justify-between rounded-[6px] bg-[var(--green)] p-3 pl-5 text-left text-[14px] font-medium text-white shadow-md shadow-black/10"
      >
        <span>{t("today.capturePrompt")}</span>
        <span className="grid h-11 w-11 place-items-center rounded-[4px] bg-[var(--red)]">
          <Plus className="h-6 w-6" />
        </span>
      </button>

      {aiStats.processedNotes ? (
        <button
          type="button"
          onClick={onOpenInbox}
          className="mt-5 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:bg-[var(--surface-strong)]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.03em]">
              <Sparkles className="h-4 w-4 text-[var(--green)]" />
              {t("today.aiUpdate")}
            </div>
            <ChevronRight className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[13px] font-bold">
            {t(
              aiStats.processedNotes === 1
                ? "today.notesProcessed.one"
                : "today.notesProcessed.many",
              { count: aiStats.processedNotes },
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <span>{t("today.accepted", { count: aiStats.acceptedCount })}</span>
            <span>{t("today.toReview", { count: aiStats.pendingCount })}</span>
          </div>
        </button>
      ) : null}

      <div className="mt-9 flex items-end justify-between">
        <h2 className="font-display text-[20px] font-bold">{t("today.myTasks")}</h2>
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className="text-[12px] font-semibold underline underline-offset-2"
        >
          {t("today.showAll")}
        </button>
      </div>

      <TaskTabs value={filter} t={t} onChange={onFilterChange} />

      <div className="mt-4 space-y-6">
        {tasks.length ? (
          groups.map((group) => {
            const project = group.project;
            const openCount = group.tasks.filter((task) => task.status !== "done").length;

            return (
              <section key={project?.id ?? "__none"}>
                <button
                  type="button"
                  onClick={project ? () => onOpenProject(project.id) : undefined}
                  disabled={!project}
                  className="flex w-full items-center gap-2 px-1 text-left disabled:cursor-default"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project?.color ?? "var(--line-strong)" }}
                  />
                  <span className="truncate font-display text-[15px] font-bold">
                    {project?.title ?? t("task.noProject")}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                    {t("projects.openCount", { count: openCount })}
                  </span>
                </button>
                <div className="mt-2 space-y-2">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={project}
                      locale={locale}
                      t={t}
                      hideProject
                      onOpen={() => onOpenTask(task.id)}
                      onToggle={() => onToggleTask(task.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : isBrandNew ? (
          <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
            <p className="font-display text-[18px] font-bold">{t("today.welcomeTitle")}</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
              {t("today.welcomeText")}
            </p>
            <button
              type="button"
              onClick={onCapture}
              className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              {t("today.captureFirst")}
            </button>
          </div>
        ) : (
          <EmptyState title={t("today.emptyTitle")} text={t("today.emptyText")} />
        )}
      </div>
    </div>
  );
}
