import { ArrowLeft, CheckSquare2, Edit3, Square } from "lucide-react";
import { cx } from "@/components/app-helpers";
import { priorityKeys, statusKeys, type TaskDetailTab } from "@/components/app-types";
import { DetailTabs } from "@/components/ui/controls";
import { GoogleSection } from "@/components/ui/google-section";
import { InfoTile, ScreenHeader } from "@/components/ui/primitives";
import { addDays, formatDateLabel, nextMonday, toIsoDate } from "@/lib/date";
import type { Locale, Translator } from "@/lib/i18n";
import type { AiSuggestion, GoogleSyncTarget, Project, Task } from "@/lib/types";

export function TaskDetailScreen({
  task,
  project,
  rawNote,
  suggestion,
  tab,
  locale,
  t,
  onBack,
  onTabChange,
  onEdit,
  onToggleDone,
  onOpenProject,
  onReschedule,
  onGoogleSynced,
}: {
  task: Task;
  project?: Project;
  rawNote?: { content: string } | undefined;
  suggestion?: AiSuggestion | undefined;
  tab: TaskDetailTab;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onTabChange: (tab: TaskDetailTab) => void;
  onEdit: () => void;
  onToggleDone: () => void;
  onOpenProject: () => void;
  onReschedule: (dueDate: string | null) => void;
  onGoogleSynced: (target: GoogleSyncTarget) => void;
}) {
  const now = new Date();
  const rescheduleOptions: Array<{ label: string; value: string | null }> = [
    { label: t("date.today"), value: toIsoDate(now) },
    { label: t("date.tomorrow"), value: toIsoDate(addDays(now, 1)) },
    { label: t("date.nextWeek"), value: toIsoDate(nextMonday(now)) },
    { label: t("date.none"), value: null },
  ];

  return (
    <div className="flex flex-1 flex-col pt-3 md:pt-8">
      <div className="px-6 md:px-8 lg:px-10">
        <ScreenHeader
          title=""
          leftIcon={<ArrowLeft className="h-5 w-5" />}
          rightIcon={<Edit3 className="h-5 w-5" />}
          leftLabel={t("common.back")}
          rightLabel={t("task.edit")}
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {project?.title ?? t("task.fallbackKicker")}
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {task.title}
        </h1>
        <div className="mt-7 grid grid-cols-2 gap-3 text-[12px]">
          <InfoTile label={t("task.status")} value={t(statusKeys[task.status])} />
          <InfoTile label={t("task.deadline")} value={formatDateLabel(task.dueDate, locale)} />
          <InfoTile label={t("task.priority")} value={t(priorityKeys[task.priority])} />
          <button
            type="button"
            onClick={onOpenProject}
            className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left"
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
              {t("task.project")}
            </span>
            <span className="mt-1 block font-bold">
              {project?.title ?? t("task.noProject")}
            </span>
          </button>
        </div>
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
            {t("task.reschedule")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rescheduleOptions.map((option) => {
              const active = task.dueDate === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onReschedule(option.value)}
                  aria-pressed={active}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                    active
                      ? "bg-[var(--green)] text-white"
                      : "border border-[var(--line-strong)] hover:bg-[var(--surface-strong)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[14px] font-bold">
          <button
            type="button"
            onClick={onToggleDone}
            className="grid h-6 w-6 place-items-center text-[var(--red)]"
          >
            {task.status === "done" ? (
              <CheckSquare2 className="h-5 w-5" />
            ) : (
              <Square className="h-5 w-5" />
            )}
          </button>
          {t("task.done")}
        </label>
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as TaskDetailTab)}
        tabs={["details", "raw", "ai"]}
        labels={{
          details: t("task.tab.details"),
          raw: t("task.tab.raw"),
          ai: t("task.tab.ai"),
        }}
      />

      <div className="space-y-5 px-6 md:px-8 lg:px-10">
        {tab === "details" ? (
          <>
            <section>
              <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                {t("task.descriptionHeading")}
              </h2>
              <p className="mt-2 text-[14px] leading-7 text-[var(--ink-soft)]">
                {task.description || t("task.noDescription")}
              </p>
            </section>
            <GoogleSection key={task.id} task={task} t={t} onSynced={onGoogleSynced} />
          </>
        ) : null}
        {tab === "raw" ? (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              {t("task.rawHeading")}
            </h2>
            <p className="mt-2 rounded-[6px] bg-[var(--surface)] p-4 text-[13px] leading-6 text-[var(--muted)]">
              {rawNote?.content ?? t("task.manualCreated")}
            </p>
          </section>
        ) : null}
        {tab === "ai" ? (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              {t("task.aiHeading")}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
              {suggestion?.reasoning ?? t("task.noAi")}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
