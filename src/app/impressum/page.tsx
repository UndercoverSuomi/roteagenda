import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Impressum – Rote Agenda",
};

export default function ImpressumPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12 text-[var(--ink)]">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
        Rote Agenda
      </p>
      <h1 className="mt-3 font-display text-[34px] font-bold">Impressum</h1>

      <section className="mt-8 space-y-6 text-[14px] leading-7">
        <div>
          <h2 className="font-display text-[20px] font-bold">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2 text-[var(--ink-soft)]">
            [PLATZHALTER: Vollständiger Name bzw. Organisation]
            <br />
            [PLATZHALTER: Straße und Hausnummer]
            <br />
            [PLATZHALTER: PLZ und Ort]
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold">Kontakt</h2>
          <p className="mt-2 text-[var(--ink-soft)]">
            E-Mail: [PLATZHALTER: Kontakt-E-Mail-Adresse]
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold">
            Verantwortlich für den Inhalt
          </h2>
          <p className="mt-2 text-[var(--ink-soft)]">
            [PLATZHALTER: Name und Anschrift der inhaltlich verantwortlichen Person]
          </p>
        </div>
      </section>

      <Link
        href="/"
        className="mt-10 inline-block text-[13px] font-bold text-[var(--red)] underline underline-offset-2"
      >
        Zurück zur App
      </Link>
    </main>
  );
}
