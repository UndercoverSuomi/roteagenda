import { ChevronRight, FolderKanban, Plus } from "lucide-react";
import { projectProgress } from "@/components/app-helpers";
import { ProgressBar, ScreenHeader } from "@/components/ui/primitives";
import { formatDateLabel } from "@/lib/date";
import type { Locale, Translator } from "@/lib/i18n";
import type { Project, Task } from "@/lib/types";

export function ProjectsScreen({
  projects,
  tasks,
  locale,
  t,
  onOpenProject,
  onCreateProject,
}: {
  projects: Project[];
  tasks: Task[];
  locale: Locale;
  t: Translator;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("projects.title")}
        leftIcon={<FolderKanban className="h-5 w-5" />}
        rightIcon={<Plus className="h-5 w-5" />}
        rightLabel={t("projects.new")}
        onRight={onCreateProject}
      />
      {!projects.length ? (
        <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
          <p className="font-display text-[18px] font-bold">{t("projects.emptyTitle")}</p>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            {t("projects.emptyText")}
          </p>
          <button
            type="button"
            onClick={onCreateProject}
            className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            {t("projects.create")}
          </button>
        </div>
      ) : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {projects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const openTasks = projectTasks.filter((task) => task.status !== "done").length;
          const nextDeadline = projectTasks
            .map((task) => task.dueDate)
            .filter(Boolean)
            .sort()[0] as string | undefined;
          const progress = projectProgress(project, projectTasks);

          return (
            <button
              type="button"
              key={project.id}
              onClick={() => onOpenProject(project.id)}
              className="w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--surface-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-[20px] font-bold leading-7">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">
                    {project.description}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px] font-semibold">
                <span>{t("projects.openCount", { count: openTasks })}</span>
                <span>
                  {nextDeadline ? formatDateLabel(nextDeadline, locale) : t("projects.noDeadline")}
                </span>
              </div>
              <ProgressBar value={progress} className="mt-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
