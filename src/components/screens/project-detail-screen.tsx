import { ArrowLeft, Edit3, Plus } from "lucide-react";
import { cx, projectProgress } from "@/components/app-helpers";
import type { ProjectDetailTab } from "@/components/app-types";
import { DetailTabs } from "@/components/ui/controls";
import { ProgressBar, ScreenHeader } from "@/components/ui/primitives";
import { TaskLine } from "@/components/ui/task-items";
import { formatDateLabel } from "@/lib/date";
import type { Locale, Translator } from "@/lib/i18n";
import type { Project, RawNote, Task } from "@/lib/types";

export function ProjectDetailScreen({
  project,
  tasks,
  notes,
  tab,
  locale,
  t,
  onBack,
  onTabChange,
  onOpenTask,
  onToggleTask,
  onAddTask,
  onToggleAi,
  onEdit,
}: {
  project: Project;
  tasks: Task[];
  notes: RawNote[];
  tab: ProjectDetailTab;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onTabChange: (tab: ProjectDetailTab) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: () => void;
  onToggleAi: () => void;
  onEdit: () => void;
}) {
  const progress = projectProgress(project, tasks);

  return (
    <div className="flex flex-1 flex-col pt-3 md:pt-8">
      <div className="px-6 md:px-8 lg:px-10">
        <ScreenHeader
          title=""
          leftIcon={<ArrowLeft className="h-5 w-5" />}
          rightIcon={<Edit3 className="h-5 w-5" />}
          leftLabel={t("common.back")}
          rightLabel={t("project.edit")}
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {t("project.kicker")}
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {project.title}
        </h1>
        <div className="mt-8 flex items-center justify-between text-[13px]">
          <span>{t("project.progress")}</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} className="mt-3" />
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as ProjectDetailTab)}
        tabs={["tasks", "details", "notes"]}
        labels={{
          tasks: t("project.tab.tasks"),
          details: t("project.tab.details"),
          notes: t("project.tab.notes"),
        }}
      />

      <div className="px-6 md:px-8 lg:px-10">
        {tab === "tasks" ? (
          <div className="divide-y divide-[var(--line)]">
            {tasks.map((task) => (
              <TaskLine
                key={task.id}
                task={task}
                locale={locale}
                onOpen={() => onOpenTask(task.id)}
                onToggle={() => onToggleTask(task.id)}
              />
            ))}
            <button
              type="button"
              onClick={onAddTask}
              className="mt-7 flex items-center gap-3 text-[14px] font-semibold text-[var(--red)]"
            >
              <Plus className="h-4 w-4" />
              {t("project.addTask")}
            </button>
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="space-y-5 pt-5">
            <p className="text-[14px] leading-7 text-[var(--ink-soft)]">
              {project.description}
            </p>
            <button
              type="button"
              onClick={onToggleAi}
              className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left"
            >
              <span>
                <span className="block text-[13px] font-bold">{t("project.aiToggle")}</span>
                <span className="text-[12px] text-[var(--muted)]">
                  {project.aiEnabled ? t("project.aiActive") : t("project.aiPaused")}
                </span>
              </span>
              <span
                className={cx(
                  "flex h-7 w-12 items-center rounded-full p-1 transition",
                  project.aiEnabled ? "bg-[var(--red)]" : "bg-[var(--line-strong)]",
                )}
              >
                <span
                  className={cx(
                    "h-5 w-5 rounded-full bg-white transition",
                    project.aiEnabled && "translate-x-5",
                  )}
                />
              </span>
            </button>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                {t("project.keywords")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-[12px]"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "notes" ? (
          notes.length ? (
            <div className="space-y-3 pt-5">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
                    {note.content}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                    {t("project.noteMeta", {
                      date: formatDateLabel(note.createdAt.slice(0, 10), locale),
                    })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-5 text-[14px] leading-7 text-[var(--muted)]">
              {t("project.notesEmpty")}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
