import { CheckSquare2, Circle, Flag, Square } from "lucide-react";
import { cx } from "@/components/app-helpers";
import { priorityKeys } from "@/components/app-types";
import { formatDateLabel, isOverdue } from "@/lib/date";
import { PRIORITY_COLORS, withAlpha } from "@/lib/project-colors";
import type { Locale, Translator } from "@/lib/i18n";
import type { Project, Task } from "@/lib/types";

export function TaskRow({
  task,
  project,
  locale,
  t,
  hideProject,
  onOpen,
  onToggle,
}: {
  task: Task;
  project?: Project;
  locale: Locale;
  t: Translator;
  hideProject?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const overdue = task.status !== "done" && isOverdue(task.dueDate);
  // Weiche Projektfarbe als Zeilenhintergrund; erledigte Aufgaben blasser.
  const tint = withAlpha(project?.color, task.status === "done" ? 0.08 : 0.16);

  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-[7px] px-3 py-3",
        hideProject ? "min-h-[52px]" : "min-h-[66px]",
      )}
      style={tint ? { backgroundColor: tint } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid h-8 w-8 shrink-0 place-items-center text-[var(--red)]"
      >
        {task.status === "done" ? (
          <CheckSquare2 className="h-5 w-5 fill-[var(--red)] text-white" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            title={t(priorityKeys[task.priority])}
            aria-label={t(priorityKeys[task.priority])}
          />
          <span
            className={cx(
              "truncate text-[14px] font-semibold",
              task.status === "done" && "text-[var(--muted)] line-through",
            )}
          >
            {task.title}
          </span>
          {task.priority === "high" && task.status !== "done" ? (
            <Flag className="h-3.5 w-3.5 shrink-0 fill-[var(--red)] text-[var(--red)]" />
          ) : null}
        </p>
        {!hideProject ? (
          <p className="mt-1 truncate pl-4 text-[12px] text-[var(--muted)]">
            {project?.title ?? t("task.noProject")}
          </p>
        ) : null}
      </button>
      <span
        className={cx(
          "shrink-0 text-[12px]",
          overdue ? "font-bold text-[var(--red)]" : "text-[var(--ink-soft)]",
        )}
      >
        {overdue ? `${t("task.overdue")} · ` : ""}
        {formatDateLabel(task.dueDate, locale)}
      </span>
    </div>
  );
}

export function TaskLine({
  task,
  locale,
  onOpen,
  onToggle,
}: {
  task: Task;
  locale: Locale;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[62px] items-center gap-3 py-3">
      <button type="button" onClick={onToggle} className="text-[var(--red)]">
        {task.status === "done" ? (
          <CheckSquare2 className="h-5 w-5 fill-[var(--red)] text-white" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-medium">{task.title}</span>
      </button>
      <span className="text-[12px] text-[var(--ink-soft)]">
        {formatDateLabel(task.dueDate, locale)}
      </span>
    </div>
  );
}
