"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { account } from "@/lib/appwrite";

type FormPhase = "form" | "submitting" | "done";

export function ResetPasswordForm() {
  // Appwrite hängt userId und secret als Query-Parameter an den Recovery-Link.
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") ?? "";
  const secret = searchParams.get("secret") ?? "";
  const isLinkValid = Boolean(userId && secret);

  const [phase, setPhase] = useState<FormPhase>("form");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setError(null);
    setPhase("submitting");

    try {
      await account.updateRecovery({ userId, secret, password });
      setPhase("done");
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Das Passwort konnte nicht gesetzt werden. Fordere ggf. einen neuen Link an.",
      );
      setPhase("form");
    }
  }

  if (!isLinkValid) {
    return (
      <>
        <p className="mt-4 text-[14px] leading-7 text-[var(--muted)]">
          Dieser Link ist unvollständig oder abgelaufen. Fordere in der App über
          „Passwort vergessen?“ einen neuen Link an.
        </p>
        <Link
          href="/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--green)] px-4 text-[13px] font-bold text-white"
        >
          Zurück zur App
        </Link>
      </>
    );
  }

  if (phase === "done") {
    return (
      <>
        <p className="mt-4 text-[14px] leading-7 text-[var(--muted)]">
          Dein Passwort wurde geändert. Du kannst dich jetzt mit dem neuen
          Passwort anmelden.
        </p>
        <Link
          href="/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--red)] px-4 text-[13px] font-bold text-white"
        >
          Zur Anmeldung
        </Link>
      </>
    );
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
          Neues Passwort
        </span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
          minLength={8}
          required
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
          Passwort wiederholen
        </span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
          minLength={8}
          required
        />
      </label>
      {error ? (
        <p className="rounded-[5px] border border-[var(--red)] bg-white/70 p-3 text-[12px] leading-5 text-[var(--red)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={phase === "submitting"}
        className="flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--red)] px-4 text-[13px] font-bold text-white disabled:opacity-50"
      >
        {phase === "submitting" ? "Bitte warten..." : "Passwort speichern"}
      </button>
    </form>
  );
}
