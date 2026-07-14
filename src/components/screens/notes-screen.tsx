"use client";

import {
  Camera,
  FolderTree,
  Link2,
  Loader2,
  Pin,
  Plus,
  Sparkles,
  StickyNote,
  Waypoints,
} from "lucide-react";
import { useRef, useState } from "react";
import { cx, isNotePending, noteDisplayTitle } from "@/components/app-helpers";
import { ScreenHeader } from "@/components/ui/primitives";
import type { Translator } from "@/lib/i18n";
import type { Note, NoteSource, Project } from "@/lib/types";

const SOURCE_ICONS: Partial<Record<NoteSource, typeof Link2>> = {
  url: Link2,
  image: Camera,
};

export function NotesScreen({
  notes,
  projectById,
  importUrl,
  isImporting,
  importError,
  t,
  onOpenNote,
  onCreateNote,
  onOpenGraph,
  onTogglePin,
  onImportUrlChange,
  onImportUrl,
  onImportImage,
  onCategorizeNotes,
}: {
  notes: Note[];
  projectById: Map<string, Project>;
  importUrl: string;
  isImporting: boolean;
  importError: string | null;
  t: Translator;
  onOpenNote: (noteId: string) => void;
  onCreateNote: () => void;
  onOpenGraph: () => void;
  onTogglePin: (noteId: string) => void;
  onImportUrlChange: (value: string) => void;
  onImportUrl: () => void;
  onImportImage: (file: File) => void;
  onCategorizeNotes: () => Promise<void>;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const canImport = /^https?:\/\/\S+$/i.test(importUrl.trim());

  // Batch-Kategorisierung: läuft asynchron im Worker; Zuordnungen und
  // Inbox-Vorschläge treffen per Realtime ein.
  const [categorizeState, setCategorizeState] = useState<"idle" | "running" | "failed">(
    "idle",
  );
  const uncategorizedCount = notes.filter(
    (note) => note.processed && !note.projectId && !isNotePending(note),
  ).length;

  async function startCategorization() {
    setCategorizeState("running");
    try {
      await onCategorizeNotes();
    } catch {
      setCategorizeState("failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("notes.title")}
        leftIcon={<StickyNote className="h-5 w-5" />}
        extraRightIcon={<Waypoints className="h-5 w-5" />}
        extraRightLabel={t("notes.graph")}
        onExtraRight={onOpenGraph}
        rightIcon={<Plus className="h-5 w-5" />}
        rightLabel={t("notes.new")}
        onRight={onCreateNote}
      />

      <div className="mt-5 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3">
            <Link2 className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input
              value={importUrl}
              onChange={(event) => onImportUrlChange(event.target.value)}
              placeholder={t("notes.importPlaceholder")}
              disabled={isImporting}
              className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--muted)]"
            />
          </div>
          <button
            type="button"
            onClick={onImportUrl}
            disabled={!canImport || isImporting}
            className="flex h-10 shrink-0 items-center gap-2 rounded-[5px] bg-[var(--red)] px-3 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isImporting ? t("notes.importing") : t("notes.importGo")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isImporting}
            aria-label={t("notes.importImage")}
            title={t("notes.importImage")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] border border-[var(--line-strong)] text-[var(--ink)] transition hover:bg-[var(--surface-strong)] disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImportImage(file);
            }}
          />
        </div>
        {importError ? (
          <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--red)]">
            {importError}
          </p>
        ) : null}
      </div>

      {uncategorizedCount > 0 && categorizeState !== "running" ? (
        <button
          type="button"
          onClick={() => void startCategorization()}
          className="mt-3 flex items-center gap-2 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left text-[12px] font-bold text-[var(--ink-soft)] transition hover:bg-[var(--surface-strong)]"
        >
          <FolderTree className="h-4 w-4 shrink-0 text-[var(--red)]" />
          {uncategorizedCount === 1
            ? t("notes.categorize.button.one")
            : t("notes.categorize.button.many", { count: uncategorizedCount })}
        </button>
      ) : null}
      {categorizeState === "running" ? (
        <p className="mt-3 flex items-center gap-2 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {t("notes.categorize.running")}
        </p>
      ) : null}
      {categorizeState === "failed" ? (
        <p className="mt-3 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--red)]">
          {t("notes.categorize.failed")}
        </p>
      ) : null}

      {!notes.length ? (
        <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
          <p className="font-display text-[18px] font-bold">{t("notes.emptyTitle")}</p>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            {t("notes.emptyText")}
          </p>
          <button
            type="button"
            onClick={onCreateNote}
            className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            {t("notes.create")}
          </button>
        </div>
      ) : null}

      {pinned.length ? (
        <NoteGroup
          label={others.length ? t("notes.pinned") : ""}
          notes={pinned}
          projectById={projectById}
          t={t}
          onOpenNote={onOpenNote}
          onTogglePin={onTogglePin}
        />
      ) : null}

      {others.length ? (
        <NoteGroup
          label={pinned.length ? t("notes.others") : ""}
          notes={others}
          projectById={projectById}
          t={t}
          onOpenNote={onOpenNote}
          onTogglePin={onTogglePin}
        />
      ) : null}
    </div>
  );
}

function NoteGroup({
  label,
  notes,
  projectById,
  t,
  onOpenNote,
  onTogglePin,
}: {
  label: string;
  notes: Note[];
  projectById: Map<string, Project>;
  t: Translator;
  onOpenNote: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
}) {
  return (
    <section className="mt-5">
      {label ? (
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
          {label}
        </h2>
      ) : null}
      <div className="columns-2 gap-3 lg:columns-3 [&>*]:mb-3">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            project={note.projectId ? projectById.get(note.projectId) : undefined}
            t={t}
            onOpen={() => onOpenNote(note.id)}
            onTogglePin={() => onTogglePin(note.id)}
          />
        ))}
      </div>
    </section>
  );
}

function NoteCard({
  note,
  project,
  t,
  onOpen,
  onTogglePin,
}: {
  note: Note;
  project?: Project;
  t: Translator;
  onOpen: () => void;
  onTogglePin: () => void;
}) {
  const SourceIcon = SOURCE_ICONS[note.source];
  const pending = isNotePending(note);
  const preview = note.enhanced || note.content || (pending ? "" : note.sourceUrl ?? "");

  return (
    <article className="relative break-inside-avoid rounded-[7px] border border-[var(--line)] bg-[var(--surface)] shadow-sm transition hover:bg-[var(--surface-strong)]">
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={note.pinned ? t("note.unpin") : t("note.pin")}
        aria-pressed={note.pinned}
        className={cx(
          "absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full transition",
          note.pinned
            ? "text-[var(--red)]"
            : "text-[var(--muted)] opacity-40 hover:opacity-100",
        )}
      >
        <Pin className={cx("h-4 w-4", note.pinned && "fill-[var(--red)]")} />
      </button>
      <button type="button" onClick={onOpen} className="block w-full p-4 pr-10 text-left">
        <h3 className="font-display text-[15px] font-bold leading-6">
          {pending && note.sourceUrl
            ? note.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)
            : noteDisplayTitle(note, t("notes.untitled"))}
        </h3>
        {pending ? (
          <p className="mt-2 flex items-center gap-2 text-[12px] leading-5 text-[var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            {t("notes.pendingCard")}
          </p>
        ) : (
          <p className="mt-2 line-clamp-6 whitespace-pre-line text-[12px] leading-5 text-[var(--ink-soft)]">
            {preview}
          </p>
        )}
        {note.tags.length ? (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]"
              >
                #{tag}
              </span>
            ))}
            {note.tags.length > 3 ? (
              <span className="px-1 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                +{note.tags.length - 3}
              </span>
            ) : null}
          </p>
        ) : null}
        <p className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
          {project ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <span className="truncate">{project.title}</span>
            </span>
          ) : null}
          {SourceIcon ? <SourceIcon className="h-3 w-3 shrink-0" /> : null}
          {!note.processed ? (
            <Sparkles className="h-3 w-3 shrink-0 opacity-50" />
          ) : null}
        </p>
      </button>
    </article>
  );
}
