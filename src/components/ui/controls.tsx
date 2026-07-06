"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/components/app-helpers";
import type { TaskFilter } from "@/components/app-types";
import type { Locale, Translator } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";

export function ThemeToggleButton({
  themePref,
  t,
  onChange,
}: {
  themePref: ThemePreference;
  t: Translator;
  onChange: (preference: ThemePreference) => void;
}) {
  // Wird nur clientseitig gerendert (nach dem Auth-Check), matchMedia ist daher sicher.
  const isDark =
    themePref === "dark" ||
    (themePref === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      type="button"
      onClick={() => onChange(isDark ? "light" : "dark")}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] border border-[var(--line)] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function LocaleSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="flex gap-1 text-[11px] font-bold">
      {(["de", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cx(
            "rounded-[4px] px-2 py-1 uppercase",
            locale === option
              ? "bg-[var(--green)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--surface-strong)]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function LegalLinks({ t, className }: { t: Translator; className?: string }) {
  return (
    <p className={cx("flex gap-4 text-[11px] text-[var(--muted)]", className)}>
      <Link href="/impressum" className="underline underline-offset-2">
        {t("legal.impressum")}
      </Link>
      <Link href="/datenschutz" className="underline underline-offset-2">
        {t("legal.datenschutz")}
      </Link>
    </p>
  );
}

export function TaskTabs({
  value,
  t,
  onChange,
}: {
  value: TaskFilter;
  t: Translator;
  onChange: (filter: TaskFilter) => void;
}) {
  const tabs: Array<{ value: TaskFilter; label: string }> = [
    { value: "all", label: t("filter.all") },
    { value: "today", label: t("filter.today") },
    { value: "planned", label: t("filter.planned") },
    { value: "later", label: t("filter.later") },
  ];

  return (
    <div className="mt-6 grid grid-cols-4 border-b border-[var(--line)] text-[14px] font-medium">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            "relative h-10",
            value === tab.value && "font-bold text-[var(--ink)]",
          )}
        >
          {tab.label}
          {value === tab.value ? (
            <span className="absolute inset-x-2 bottom-[-1px] h-0.5 bg-[var(--red)]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function DetailTabs({
  value,
  onChange,
  tabs,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: string[];
  labels: Record<string, string>;
}) {
  return (
    <div className="mt-8 grid grid-cols-3 border-y border-[var(--line)] text-[14px] font-medium">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab}
          onClick={() => onChange(tab)}
          className={cx("relative h-14", value === tab && "font-bold")}
        >
          {labels[tab]}
          {value === tab ? (
            <span className="absolute inset-x-6 bottom-[-1px] h-0.5 bg-[var(--red)]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
