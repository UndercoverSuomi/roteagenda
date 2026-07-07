"use client";

import { MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/app-helpers";
import { LegalLinks } from "@/components/ui/controls";
import { InfoTile, ScreenHeader } from "@/components/ui/primitives";
import { AI_MODEL_OPTIONS, type AiModelId } from "@/lib/ai-models";
import type { Locale, Translator } from "@/lib/i18n";
import type { SyncStatus } from "@/lib/sync-queue";
import type { ThemePreference } from "@/lib/theme";

export function MoreScreen({
  userName,
  userEmail,
  aiModel,
  locale,
  themePref,
  syncStatus,
  isOnline,
  t,
  onAiModelChange,
  onLocaleChange,
  onThemeChange,
  onDeleteAll,
  onLogout,
}: {
  userName: string;
  userEmail: string;
  aiModel: AiModelId;
  locale: Locale;
  themePref: ThemePreference;
  syncStatus: SyncStatus;
  isOnline: boolean;
  t: Translator;
  onAiModelChange: (model: AiModelId) => void;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onDeleteAll: () => void;
  onLogout: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const syncLabel = !isOnline
    ? t("more.sync.offline")
    : syncStatus === "saving"
      ? t("more.sync.saving")
      : syncStatus === "error"
        ? t("more.sync.error")
        : t("more.sync.ok");

  const selectClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] font-bold outline-none";
  const labelClass =
    "mb-2 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]";

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader title={t("more.title")} leftIcon={<MoreHorizontal className="h-5 w-5" />} />
      <div className="mt-8 space-y-3">
        <InfoTile label={t("more.product")} value={t("more.productValue")} />
        <InfoTile label={t("more.account")} value={userName || userEmail} />
        <InfoTile label={t("more.storage")} value={syncLabel} />
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="block">
            <span className={labelClass}>{t("more.aiModel")}</span>
            <select
              value={aiModel}
              onChange={(event) => onAiModelChange(event.target.value as AiModelId)}
              className={selectClass}
            >
              {AI_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="block">
            <span className={labelClass}>{t("more.language")}</span>
            <select
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as Locale)}
              className={selectClass}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <span className={labelClass}>{t("more.theme")}</span>
          <div className="grid grid-cols-3 gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--field)] p-1">
            {(["system", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onThemeChange(option)}
                aria-pressed={themePref === option}
                className={cx(
                  "rounded-[4px] px-2 py-2 text-[12px] font-bold transition",
                  themePref === option
                    ? "bg-[var(--green)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {t(`theme.${option}`)}
              </button>
            ))}
          </div>
        </section>
        {confirmingDelete ? (
          <div className="rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              {t("more.deleteAllTitle")}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              {t("more.deleteAllText")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDeleteAll();
                }}
                className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
              >
                {t("more.deleteAllYes")}
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
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold text-[var(--red)]"
          >
            {t("more.deleteAll")}
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold"
        >
          {t("more.logout")}
          <X className="h-4 w-4" />
        </button>
        <LegalLinks t={t} className="pt-2" />
      </div>
    </div>
  );
}
