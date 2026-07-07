"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui/primitives";
import type { Translator } from "@/lib/i18n";
import type { Note, Project } from "@/lib/types";

export function NoteEditor({
  note,
  isNew,
  projects,
  t,
  onClose,
  onDelete,
  onSave,
}: {
  note: Note;
  isNew: boolean;
  projects: Project[];
  t: Translator;
  onClose: () => void;
  onDelete: (noteId: string) => void;
  onSave: (note: Note) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [tagsText, setTagsText] = useState(note.tags.join(", "));
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";

  function parseTags(value: string) {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">
            {isNew ? t("noteEditor.createTitle") : t("noteEditor.editTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field label={t("editor.titleLabel")}>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label={t("noteEditor.content")}>
            <textarea
              value={draft.content}
              onChange={(event) =>
                setDraft((current) => ({ ...current, content: event.target.value }))
              }
              maxLength={8000}
              className="min-h-36 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] leading-6 outline-none"
            />
          </Field>
          <Field label={t("noteEditor.tags")}>
            <input
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder={t("projectEditor.keywordsPlaceholder")}
              className={inputClass}
            />
          </Field>
          <Field label={t("editor.project")}>
            <select
              value={draft.projectId ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  projectId: event.target.value || null,
                }))
              }
              className={inputClass}
            >
              <option value="">{t("noteEditor.noProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                ...draft,
                title: draft.title.trim(),
                content: draft.content.trim(),
                tags: parseTags(tagsText),
                updatedAt: new Date().toISOString(),
              })
            }
            disabled={!draft.content.trim()}
            className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
          {!isNew ? (
            <button
              type="button"
              onClick={() => onDelete(draft.id)}
              className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
            >
              {t("common.delete")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
