import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { LegalLinks } from "@/components/ui/controls";
import type { Translator } from "@/lib/i18n";

export function WelcomeScreen({ t, onStart }: { t: Translator; onStart: () => void }) {
  return (
    <div className="relative flex flex-1 overflow-hidden md:min-h-[calc(100vh-48px)]">
      <Image
        src="/welcome-movement.png"
        alt={t("welcome.imageAlt")}
        fill
        priority
        sizes="(max-width: 768px) 100vw, 62vw"
        className="object-cover object-left-bottom md:w-[58%] md:max-w-[720px]"
      />
      <div className="relative z-10 flex flex-1 flex-col px-8 pb-8 pt-[18vh] md:ml-[48%] md:max-w-[620px] md:px-12 md:pb-12 md:pt-24 lg:pt-32">
        <div className="ml-[35%] max-w-[230px] md:ml-0 md:max-w-none">
          <p className="hidden text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--red)] md:block">
            {t("welcome.kicker")}
          </p>
          <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--green)] md:mt-4 md:text-[64px] lg:text-[72px]">
            Rote Agenda
          </h1>
          <p className="mt-6 font-display text-[17px] font-bold leading-7 text-[var(--ink)] md:max-w-[430px] md:text-[23px] md:leading-9">
            {t("welcome.tagline")}
          </p>
          <div className="mt-8 h-0.5 w-10 bg-[var(--red)]" />
          <p className="mt-6 max-w-[210px] font-display text-[14px] italic leading-6 text-[var(--ink-soft)] md:max-w-[470px] md:text-[16px] md:leading-8">
            {t("welcome.motto")}
          </p>
          <p className="mt-5 hidden max-w-[500px] text-[14px] leading-7 text-[var(--muted)] md:block">
            {t("welcome.desc")}
          </p>
        </div>

        <div className="mt-auto space-y-6 md:max-w-sm">
          <button
            type="button"
            onClick={onStart}
            className="flex h-15 w-full items-center justify-between rounded-[6px] border border-white/70 bg-[var(--green)] px-8 font-display text-[16px] font-bold text-[var(--cream)] shadow-lg shadow-black/10 transition hover:bg-[var(--green-2)]"
          >
            <span>{t("welcome.start")}</span>
            <ChevronRight className="h-5 w-5" />
          </button>
          <LegalLinks
            t={t}
            className="justify-center text-[var(--cream)] md:justify-start md:text-[var(--muted)]"
          />
        </div>
      </div>
    </div>
  );
}
