import { ArrowLeft, Edit3, Loader2, Pin, Sparkles } from "lucide-react";
import { cx, isNotePending, noteDisplayTitle } from "@/components/app-helpers";
import { ScreenHeader } from "@/components/ui/primitives";
import { TaskLine } from "@/components/ui/task-items";
import { formatDateLabel } from "@/lib/date";
import type { Locale, MessageKey, Translator } from "@/lib/i18n";
import type { Note, Project, Task } from "@/lib/types";

const SOURCE_KEYS: Record<Note["source"], MessageKey> = {
  manual: "note.source.manual",
  capture: "note.source.capture",
  url: "note.source.url",
  image: "note.source.image",
};

export function NoteDetailScreen({
  note,
  project,
  relatedNotes,
  linkedTasks,
  isEnhancing,
  enhanceError,
  newSuggestionCount,
  locale,
  t,
  onBack,
  onEdit,
  onTogglePin,
  onEnhance,
  onOpenNote,
  onOpenTask,
  onToggleTask,
  onOpenProject,
  onOpenInbox,
}: {
  note: Note;
  project?: Project;
  relatedNotes: Note[];
  linkedTasks: Task[];
  isEnhancing: boolean;
  enhanceError: string | null;
  newSuggestionCount: number;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onEnhance: () => void;
  onOpenNote: (noteId: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenInbox: () => void;
}) {
  const headingClass =
    "text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]";
  // Link-/Foto-Notizen füllt der Notiz-Worker asynchron; bis dahin Pending-Banner.
  const pending = isNotePending(note);

  return (
    <div className="flex flex-1 flex-col px-6 pb-8 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title=""
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        extraRightIcon={
          <Pin className={cx("h-5 w-5", note.pinned && "fill-[var(--red)] text-[var(--red)]")} />
        }
        rightIcon={<Edit3 className="h-5 w-5" />}
        leftLabel={t("common.back")}
        extraRightLabel={note.pinned ? t("note.unpin") : t("note.pin")}
        rightLabel={t("note.edit")}
        onLeft={onBack}
        onExtraRight={onTogglePin}
        onRight={onEdit}
      />

      {project ? (
        <button
          type="button"
          onClick={() => onOpenProject(project.id)}
          className="mt-8 flex items-center gap-2 text-left text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          {project.title}
        </button>
      ) : (
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {t("note.kicker")}
        </p>
      )}

      <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
        {noteDisplayTitle(note, t("notes.untitled"))}
      </h1>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
        {t(SOURCE_KEYS[note.source])} · {formatDateLabel(note.createdAt.slice(0, 10), locale)}
      </p>

      {note.tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-[12px] text-[var(--ink-soft)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {pending ? (
          <div className="flex items-start gap-3 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--green-2)]" />
            <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
              {note.source === "url" ? t("note.pendingUrl") : t("note.pendingImage")}
            </p>
          </div>
        ) : null}

        {note.processingError ? (
          <p className="rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
            {t("note.processingFailed", { detail: note.processingError })}
          </p>
        ) : null}

        {note.enhanced ? (
          <section>
            <h2 className={headingClass}>{t("note.enhancedHeading")}</h2>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-7 text-[var(--ink-soft)]">
              {note.enhanced}
            </p>
          </section>
        ) : null}

        {note.content || note.sourceUrl ? (
          <section>
            <h2 className={headingClass}>{t("note.originalHeading")}</h2>
            {note.content ? (
              <p className="mt-2 whitespace-pre-line rounded-[6px] bg-[var(--surface)] p-4 text-[13px] leading-6 text-[var(--muted)]">
                {note.content}
              </p>
            ) : null}
            {note.sourceUrl ? (
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 block truncate text-[12px] font-semibold text-[var(--red)] underline underline-offset-2"
              >
                {note.sourceUrl}
              </a>
            ) : null}
          </section>
        ) : null}

        {!pending ? (
        <section>
          {!note.processed && !isEnhancing ? (
            <p className="mb-2 text-[13px] leading-6 text-[var(--muted)]">
              {t("note.notProcessed")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onEnhance}
            disabled={isEnhancing || !note.content.trim()}
            className="flex items-center gap-2 rounded-[5px] border border-[var(--line-strong)] px-4 py-2.5 text-[12px] font-bold disabled:opacity-50"
          >
            {isEnhancing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isEnhancing
              ? t("note.enhancing")
              : note.processed
                ? t("note.enhanceAgain")
                : t("note.enhance")}
          </button>
          {enhanceError ? (
            <p className="mt-3 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
              {enhanceError}
            </p>
          ) : null}
          {newSuggestionCount > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3">
              <p className="text-[12px] font-bold text-[var(--green-2)]">
                {t(
                  newSuggestionCount === 1
                    ? "note.suggestionsReady.one"
                    : "note.suggestionsReady.many",
                  { count: newSuggestionCount },
                )}
              </p>
              <button
                type="button"
                onClick={onOpenInbox}
                className="shrink-0 text-[12px] font-bold text-[var(--red)] underline underline-offset-2"
              >
                {t("note.openInbox")}
              </button>
            </div>
          ) : null}
        </section>
        ) : null}

        {relatedNotes.length ? (
          <section>
            <h2 className={headingClass}>{t("note.relatedHeading")}</h2>
            <div className="mt-2 space-y-2">
              {relatedNotes.map((related) => (
                <button
                  key={related.id}
                  type="button"
                  onClick={() => onOpenNote(related.id)}
                  className="block w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition hover:bg-[var(--surface-strong)]"
                >
                  <span className="block truncate text-[13px] font-bold">
                    {noteDisplayTitle(related, t("notes.untitled"))}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                    {(related.enhanced || related.content).slice(0, 90)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {linkedTasks.length ? (
          <section>
            <h2 className={headingClass}>{t("note.tasksHeading")}</h2>
            <div className="mt-1 divide-y divide-[var(--line)]">
              {linkedTasks.map((task) => (
                <TaskLine
                  key={task.id}
                  task={task}
                  locale={locale}
                  onOpen={() => onOpenTask(task.id)}
                  onToggle={() => onToggleTask(task.id)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
