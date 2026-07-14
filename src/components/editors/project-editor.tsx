"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/app-helpers";
import { Field } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/use-dialog";
import type { MessageKey, Translator } from "@/lib/i18n";
import { PROJECT_COLORS } from "@/lib/project-colors";
import type { Project } from "@/lib/types";

export function ProjectEditor({
  project,
  isNew,
  taskCount,
  t,
  onClose,
  onDelete,
  onSave,
}: {
  project: Project;
  isNew: boolean;
  taskCount: number;
  t: Translator;
  onClose: () => void;
  onDelete: (projectId: string) => void;
  onSave: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [keywordsText, setKeywordsText] = useState(project.keywords.join(", "));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const heading = isNew ? t("projectEditor.createTitle") : t("projectEditor.editTitle");
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";

  function parseKeywords(value: string) {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 12);
  }

  const deleteConfirmKey: MessageKey =
    taskCount === 0
      ? "projectEditor.deleteConfirm.none"
      : taskCount === 1
        ? "projectEditor.deleteConfirm.one"
        : "projectEditor.deleteConfirm.many";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl outline-none md:rounded-[18px]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">{heading}</h2>
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
          <Field label={t("editor.description")}>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-20 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label={t("projectEditor.keywords")}>
            <input
              value={keywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              placeholder={t("projectEditor.keywordsPlaceholder")}
              className={inputClass}
            />
          </Field>
          <Field label={t("projectEditor.color")}>
            {/* 3er-Spalten = Farbfamilien; benachbarte Familien ähneln sich. */}
            <div className="grid grid-cols-9 gap-2 pt-1">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  className={cx(
                    "h-7 w-7 rounded-full border border-black/10 transition",
                    draft.color === color &&
                      "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--paper-soft)]",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </Field>
          <label className="flex items-center justify-between rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] font-bold">
            {t("projectEditor.aiLabel")}
            <input
              type="checkbox"
              checked={draft.aiEnabled}
              onChange={(event) =>
                setDraft((current) => ({ ...current, aiEnabled: event.target.checked }))
              }
              className="h-4 w-4 accent-[var(--red)]"
            />
          </label>
        </div>
        {confirmingDelete ? (
          <div className="mt-5 rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              {t(deleteConfirmKey, { count: taskCount })}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
              >
                {t("projectEditor.confirmYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...draft,
                  title: draft.title.trim(),
                  keywords: parseKeywords(keywordsText),
                  updatedAt: new Date().toISOString(),
                })
              }
              disabled={!draft.title.trim()}
              className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {t("common.save")}
            </button>
            {!isNew ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
              >
                {t("common.delete")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
