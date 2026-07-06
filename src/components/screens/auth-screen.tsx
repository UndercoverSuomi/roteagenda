"use client";

import { useState } from "react";
import type { AuthMode } from "@/components/app-types";
import { LegalLinks, LocaleSwitch, ThemeToggleButton } from "@/components/ui/controls";
import { Field } from "@/components/ui/primitives";
import type { Locale, Translator } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";

export function AuthScreen({
  mode,
  error,
  notice,
  isSubmitting,
  locale,
  themePref,
  t,
  onLocaleChange,
  onThemeChange,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  locale: Locale;
  themePref: ThemePreference;
  t: Translator;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: { email: string; password: string; name: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const isRegister = mode === "register";
  const isRecover = mode === "recover";

  const title = isRecover
    ? t("auth.title.recover")
    : isRegister
      ? t("auth.title.register")
      : t("auth.title.login");
  const submitLabel = isRecover
    ? t("auth.submit.recover")
    : isRegister
      ? t("auth.submit.register")
      : t("auth.submit.login");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
            Rote Agenda
          </p>
          <div className="flex items-center gap-2">
            <LocaleSwitch locale={locale} onChange={onLocaleChange} />
            <ThemeToggleButton themePref={themePref} t={t} onChange={onThemeChange} />
          </div>
        </div>
        <h1 className="mt-3 font-display text-[34px] font-bold">{title}</h1>
        {isRecover ? (
          <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">
            {t("auth.recoverHint")}
          </p>
        ) : null}
        <form
          className="mt-7 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ email: email.trim(), password, name: name.trim() });
          }}
        >
          {isRegister ? (
            <Field label={t("auth.name")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
              />
            </Field>
          ) : null}
          <Field label={t("auth.email")}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
              required
            />
          </Field>
          {!isRecover ? (
            <Field label={t("auth.password")}>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
                minLength={8}
                required
              />
            </Field>
          ) : null}
          {error ? (
            <p className="rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--red)] px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? t("common.pleaseWait") : submitLabel}
          </button>
        </form>
        <div className="mt-5 flex flex-col items-start gap-2">
          {mode === "login" ? (
            <>
              <button
                type="button"
                onClick={() => onModeChange("register")}
                className="text-[12px] font-bold underline underline-offset-2"
              >
                {t("auth.toRegister")}
              </button>
              <button
                type="button"
                onClick={() => onModeChange("recover")}
                className="text-[12px] font-bold underline underline-offset-2"
              >
                {t("auth.toRecover")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className="text-[12px] font-bold underline underline-offset-2"
            >
              {isRegister ? t("auth.backToLogin.register") : t("auth.backToLogin.recover")}
            </button>
          )}
        </div>
        <LegalLinks t={t} className="mt-6" />
      </section>
    </main>
  );
}
