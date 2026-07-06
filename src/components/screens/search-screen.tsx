"use client";

import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useMemo } from "react";
import { ScreenHeader } from "@/components/ui/primitives";
import { TaskRow } from "@/components/ui/task-items";
import { formatDateLabel } from "@/lib/date";
import type { Locale, Translator } from "@/lib/i18n";
import type { Project, RawNote, Task } from "@/lib/types";

// Obergrenze pro Gruppe, damit sehr breite Suchbegriffe die Liste nicht fluten.
const MAX_RESULTS_PER_GROUP = 25;

export function SearchScreen({
  query,
  tasks,
  projects,
  rawNotes,
  projectById,
  locale,
  t,
  onQueryChange,
  onBack,
  onOpenTask,
  onOpenProject,
  onToggleTask,
}: {
  query: string;
  tasks: Task[];
  projects: Project[];
  rawNotes: RawNote[];
  projectById: Map<string, Project>;
  locale: Locale;
  t: Translator;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!needle) {
      return { tasks: [], projects: [], notes: [] };
    }

    const matches = (...fields: string[]) =>
      fields.some((field) => field.toLowerCase().includes(needle));

    return {
      tasks: tasks
        .filter((task) => matches(task.title, task.description))
        .slice(0, MAX_RESULTS_PER_GROUP),
      projects: projects
        .filter((project) =>
          matches(project.title, project.description, project.keywords.join(" ")),
        )
        .slice(0, MAX_RESULTS_PER_GROUP),
      notes: rawNotes
        .filter((note) => matches(note.content))
        .slice(0, MAX_RESULTS_PER_GROUP),
    };
  }, [needle, tasks, projects, rawNotes]);

  const hasResults = Boolean(
    results.tasks.length || results.projects.length || results.notes.length,
  );
  const groupHeadingClass =
    "text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]";

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("search.title")}
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        leftLabel={t("common.back")}
        onLeft={onBack}
        rightIcon={<Search className="h-5 w-5" />}
      />

      <div className="mt-6 flex items-center gap-3 rounded-[7px] border border-[var(--line)] bg-[var(--field)] px-4">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus
          className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--muted)]"
        />
      </div>

      {!needle ? (
        <p className="mt-4 text-[13px] leading-6 text-[var(--muted)]">{t("search.hint")}</p>
      ) : null}

      {needle && !hasResults ? (
        <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5 text-[13px] leading-6 text-[var(--muted)]">
          {t("search.empty", { query: query.trim() })}
        </div>
      ) : null}

      {results.tasks.length ? (
        <section className="mt-6">
          <h2 className={groupHeadingClass}>{t("search.tasks")}</h2>
          <div className="mt-2 space-y-2">
            {results.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                project={projectById.get(task.projectId)}
                locale={locale}
                t={t}
                onOpen={() => onOpenTask(task.id)}
                onToggle={() => onToggleTask(task.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {results.projects.length ? (
        <section className="mt-6">
          <h2 className={groupHeadingClass}>{t("search.projects")}</h2>
          <div className="mt-2 space-y-2">
            {results.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="flex w-full items-center gap-3 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition hover:bg-[var(--surface-strong)]"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="min-w-0 flex-1 truncate font-display text-[16px] font-bold">
                  {project.title}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {results.notes.length ? (
        <section className="mt-6 pb-6">
          <h2 className={groupHeadingClass}>{t("search.notes")}</h2>
          <div className="mt-2 space-y-3">
            {results.notes.map((note) => (
              <div
                key={note.id}
                className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <p className="line-clamp-3 text-[13px] leading-6 text-[var(--ink-soft)]">
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
        </section>
      ) : null}
    </div>
  );
}
