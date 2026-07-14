"use client";

import { useState } from "react";
import { suggestionStatusKey } from "@/components/app-helpers";
import { priorityKeys } from "@/components/app-types";
import { Field, InfoTile } from "@/components/ui/primitives";
import { formatDateLabel } from "@/lib/date";
import type { Locale, Translator } from "@/lib/i18n";
import type { AiSuggestion, Project, TaskPriority } from "@/lib/types";

// "2026-07-08T09:00" → "Mi, 08.07., 09:00" (bzw. Locale-Format).
function formatEventTime(eventStart: string, locale: Locale) {
  return `${formatDateLabel(eventStart.slice(0, 10), locale)}, ${eventStart.slice(11, 16)}`;
}

export function SuggestionCard({
  suggestion,
  projects,
  isEditing,
  compact,
  locale,
  t,
  onAccept,
  onCreateTask,
  onReject,
  onEdit,
  onCancelEdit,
  onUpdate,
}: {
  suggestion: AiSuggestion;
  projects: Project[];
  isEditing: boolean;
  compact?: boolean;
  locale: Locale;
  t: Translator;
  onAccept: () => void;
  onCreateTask: () => void;
  onReject: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (suggestion: AiSuggestion) => void;
}) {
  const project = projects.find((item) => item.id === suggestion.suggestedProjectId);
  const isEvent = suggestion.kind === "event";
  const isProject = suggestion.kind === "project";

  if (suggestion.state !== "pending") {
    return (
      <div className="rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold text-[var(--muted)]">
        {suggestion.state === "accepted"
          ? isEvent
            ? t("sugg.eventAccepted")
            : isProject
              ? t("sugg.projectAccepted")
              : t("sugg.accepted")
          : t("sugg.rejected")}
      </div>
    );
  }

  if (isEditing) {
    return (
      <SuggestionEditor
        suggestion={suggestion}
        projects={projects}
        t={t}
        onCancel={onCancelEdit}
        onSave={onUpdate}
      />
    );
  }

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[var(--red)]">
            {t(suggestionStatusKey(suggestion))}
          </p>
          <h2 className="mt-2 font-display text-[20px] font-bold leading-7">
            {suggestion.suggestedTitle}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--green)] px-2.5 py-1 text-[11px] font-bold text-white">
          {Math.round(suggestion.confidence * 100)}%
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
        {isProject ? (
          <>
            <InfoTile label={t("sugg.project")} value={t("sugg.projectNewValue")} />
            <InfoTile
              label={t("sugg.notesToAssign")}
              value={String(
                new Set([suggestion.rawNoteId, ...suggestion.suggestedNoteIds]).size,
              )}
            />
          </>
        ) : (
          <>
            {isEvent && suggestion.eventStart ? (
              <InfoTile
                label={t("sugg.eventTime")}
                value={formatEventTime(suggestion.eventStart, locale)}
              />
            ) : (
              <InfoTile
                label={t("sugg.deadline")}
                value={formatDateLabel(suggestion.dueDate, locale)}
              />
            )}
            <InfoTile
              label={t("sugg.project")}
              value={project?.title ?? suggestion.suggestedNewProjectTitle ?? t("sugg.unclear")}
            />
            {!isEvent ? (
              <>
                <InfoTile
                  label={t("sugg.priority")}
                  value={t(priorityKeys[suggestion.priority])}
                />
                <InfoTile label={t("sugg.source")} value={t("sugg.sourceValue")} />
              </>
            ) : null}
          </>
        )}
      </dl>

      {!compact ? (
        <p className="mt-4 text-[12px] leading-5 text-[var(--muted)]">
          {suggestion.reasoning}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
        >
          {isEvent
            ? t("sugg.acceptEvent")
            : isProject
              ? t("sugg.acceptProject")
              : t("sugg.accept")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("sugg.edit")}
        </button>
        {!isEvent && !isProject ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
            >
              {t("sugg.reassign")}
            </button>
            <button
              type="button"
              onClick={onCreateTask}
              className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
            >
              {t("sugg.createTask")}
            </button>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onReject}
        className="mt-3 text-[12px] font-bold text-[var(--muted)] underline underline-offset-2"
      >
        {t("sugg.ignore")}
      </button>
    </article>
  );
}

function SuggestionEditor({
  suggestion,
  projects,
  t,
  onCancel,
  onSave,
}: {
  suggestion: AiSuggestion;
  projects: Project[];
  t: Translator;
  onCancel: () => void;
  onSave: (suggestion: AiSuggestion) => void;
}) {
  const [draft, setDraft] = useState(suggestion);
  const isEvent = draft.kind === "event";
  const isProject = draft.kind === "project";
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";

  function handleSave() {
    if (isProject) {
      // Der Titel ist der Projektname — beide Felder synchron halten.
      onSave({ ...draft, suggestedNewProjectTitle: draft.suggestedTitle });
      return;
    }
    if (isEvent && draft.eventStart) {
      // Termin-Datum konsistent halten.
      onSave({ ...draft, dueDate: draft.eventStart.slice(0, 10) });
      return;
    }
    onSave(draft);
  }

  if (isProject) {
    return (
      <article className="rounded-[7px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 shadow-sm">
        <Field label={t("sugg.newProjectLabel")}>
          <input
            value={draft.suggestedTitle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, suggestedTitle: event.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
          >
            {t("common.cancel")}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 shadow-sm">
      <div className="space-y-3">
        <Field label={t("sugg.taskLabel")}>
          <input
            value={draft.suggestedTitle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, suggestedTitle: event.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("sugg.project")}>
          <select
            value={draft.suggestedProjectId ?? "__new"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                suggestedProjectId: event.target.value === "__new" ? null : event.target.value,
                suggestedNewProjectTitle:
                  event.target.value === "__new"
                    ? current.suggestedNewProjectTitle ?? t("sugg.newProjectLabel")
                    : null,
              }))
            }
            className={inputClass}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
            <option value="__new">{t("sugg.proposeNew")}</option>
          </select>
        </Field>
        {!draft.suggestedProjectId ? (
          <Field label={t("sugg.newProjectLabel")}>
            <input
              value={draft.suggestedNewProjectTitle ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  suggestedNewProjectTitle: event.target.value,
                }))
              }
              className={inputClass}
            />
          </Field>
        ) : null}
        {isEvent ? (
          <Field label={t("sugg.eventStart")}>
            <input
              type="datetime-local"
              value={draft.eventStart ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  eventStart: event.target.value || current.eventStart,
                }))
              }
              className={inputClass}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("sugg.deadline")}>
              <input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueDate: event.target.value || null,
                  }))
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("sugg.priority")}>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
                className={inputClass}
              >
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </select>
            </Field>
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("common.cancel")}
        </button>
      </div>
    </article>
  );
}
