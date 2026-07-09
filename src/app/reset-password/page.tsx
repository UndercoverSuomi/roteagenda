import type { Metadata } from "next";
import { Suspense } from "react";
import { translate } from "@/lib/i18n";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Neues Passwort – Rote Agenda",
};

// Server Component ohne Zugriff auf die Gerätesprache — wie überall rendert
// das Server-HTML Deutsch; Überschrift und Formular lokalisieren clientseitig.
export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Rote Agenda
        </p>
        <Suspense
          fallback={
            <p className="mt-4 text-[14px] leading-7 text-[var(--muted)]">
              {translate("de", "reset.checking")}
            </p>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}
