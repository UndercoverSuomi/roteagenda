"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui/primitives";
import type { Translator } from "@/lib/i18n";
import type { Project, Task, TaskPriority, TaskStatus } from "@/lib/types";

export function TaskEditor({
  task,
  projects,
  t,
  onClose,
  onDelete,
  onSave,
}: {
  task: Task;
  projects: Project[];
  t: Translator;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState(task);
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";
  const smallInputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-2 text-[12px] outline-none";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">{t("taskEditor.title")}</h2>
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
              className="min-h-24 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label={t("editor.project")}>
            <select
              value={draft.projectId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, projectId: event.target.value }))
              }
              className={inputClass}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("editor.status")}>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TaskStatus,
                  }))
                }
                className={smallInputClass}
              >
                <option value="open">{t("status.open")}</option>
                <option value="in_progress">{t("status.in_progress")}</option>
                <option value="done">{t("status.done")}</option>
              </select>
            </Field>
            <Field label={t("editor.priority")}>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
                className={smallInputClass}
              >
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </select>
            </Field>
            <Field label={t("editor.deadline")}>
              <input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dueDate: event.target.value || null }))
                }
                className={smallInputClass}
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}
            disabled={!draft.title.trim()}
            className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
