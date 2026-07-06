import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutz – Rote Agenda",
};

export default function DatenschutzPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12 text-[var(--ink)]">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
        Rote Agenda
      </p>
      <h1 className="mt-3 font-display text-[34px] font-bold">Datenschutzerklärung</h1>

      <section className="mt-8 space-y-6 text-[14px] leading-7 text-[var(--ink-soft)]">
        <div>
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">
            Verantwortliche Stelle
          </h2>
          <p className="mt-2">
            [PLATZHALTER: Name und Kontaktdaten der verantwortlichen Person/Organisation,
            identisch mit dem Impressum]
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">
            Welche Daten verarbeitet werden
          </h2>
          <p className="mt-2">
            Rote Agenda speichert die Daten, die du aktiv anlegst: dein Nutzerkonto
            (Name, E-Mail-Adresse, Passwort-Hash), Projekte, Aufgaben, Rohnotizen und
            KI-Vorschläge. Ohne Konto ist keine Nutzung möglich.
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">
            Hosting und Speicherung (Appwrite)
          </h2>
          <p className="mt-2">
            Konto und Inhalte werden bei Appwrite (Appwrite Cloud, Region Frankfurt am
            Main, Deutschland) gespeichert. Zur Anmeldung setzt Appwrite technisch
            notwendige Session-Cookies. Es findet kein Tracking zu Werbezwecken statt.
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">
            KI-Verarbeitung von Rohnotizen
          </h2>
          <p className="mt-2">
            Wenn du eine Rohnotiz mit der KI verarbeitest, werden der Notiztext sowie
            Titel, Beschreibungen und Keywords deiner Projekte an den von dir in den
            Einstellungen gewählten KI-Anbieter übermittelt, um Aufgabenvorschläge zu
            erzeugen. [PLATZHALTER: Liste der tatsächlich konfigurierten Anbieter samt
            Sitz/Drittlandtransfer, z. B. OpenAI (USA) – je nachdem, welche API-Keys
            produktiv gesetzt sind.] Die Verarbeitung erfolgt nur auf deine aktive
            Anfrage hin.
          </p>
        </div>

        <div>
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">
            Deine Rechte
          </h2>
          <p className="mt-2">
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerspruch. In der App kannst du
            unter „Mehr“ jederzeit alle Inhalte löschen. Zur vollständigen Löschung
            deines Kontos wende dich an [PLATZHALTER: Kontakt-E-Mail-Adresse]. Du hast
            zudem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
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
