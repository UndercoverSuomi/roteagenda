import { ClipboardList, Home, Inbox, MoreHorizontal, Plus, Search } from "lucide-react";
import { cx } from "@/components/app-helpers";
import type { Screen } from "@/components/app-types";
import { ThemeToggleButton } from "@/components/ui/controls";
import type { Translator } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";

export function BottomNav({
  screen,
  pendingCount,
  t,
  onNavigate,
}: {
  screen: Screen;
  pendingCount: number;
  t: Translator;
  onNavigate: (screen: Screen) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: t("nav.today"), icon: Home },
    { screen: "projects" as Screen, label: t("nav.projects"), icon: ClipboardList },
    { screen: "inbox" as Screen, label: t("nav.inbox"), icon: Inbox, count: pendingCount },
    { screen: "more" as Screen, label: t("nav.more"), icon: MoreHorizontal },
  ];

  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 h-[92px] bg-[var(--green)] px-5 pt-4 text-white shadow-[0_-18px_40px_rgb(0_0_0_/_14%)] md:hidden">
      <div className="grid grid-cols-[1fr_1fr_76px_1fr_1fr] items-start text-[10px] font-semibold">
        {items.slice(0, 2).map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onNavigate={onNavigate} />
        ))}
        <button
          type="button"
          onClick={() => onNavigate("capture")}
          className="mx-auto -mt-3 grid h-[62px] w-[62px] place-items-center rounded-full bg-[var(--red)] text-white shadow-lg shadow-black/25"
          aria-label={t("nav.capture")}
        >
          <Plus className="h-9 w-9" />
        </button>
        {items.slice(2).map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: { screen: Screen; label: string; icon: React.ElementType; count?: number };
  active: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.screen)}
      className={cx("relative flex flex-col items-center gap-1", active ? "text-[var(--red)]" : "text-white")}
    >
      <Icon className={cx("h-5 w-5", active && "fill-[var(--red)]")} />
      <span>{item.label}</span>
      {item.count ? (
        <span className="absolute right-3 top-[-5px] grid h-4 min-w-4 place-items-center rounded-full bg-[var(--red)] px-1 text-[9px] text-white">
          {item.count}
        </span>
      ) : null}
    </button>
  );
}

export function DesktopSidebar({
  screen,
  pendingCount,
  themePref,
  t,
  onNavigate,
  onThemeChange,
}: {
  screen: Screen;
  pendingCount: number;
  themePref: ThemePreference;
  t: Translator;
  onNavigate: (screen: Screen) => void;
  onThemeChange: (preference: ThemePreference) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: t("nav.today"), icon: Home },
    { screen: "projects" as Screen, label: t("nav.projects"), icon: ClipboardList },
    {
      screen: "inbox" as Screen,
      label: `${t("nav.inbox")}${pendingCount ? ` (${pendingCount})` : ""}`,
      icon: Inbox,
    },
    { screen: "search" as Screen, label: t("nav.search"), icon: Search },
    { screen: "more" as Screen, label: t("nav.more"), icon: MoreHorizontal },
  ];

  return (
    <aside className="sticky top-6 hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 md:block">
      <div className="px-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[24px] font-bold">Rote Agenda</p>
          <ThemeToggleButton themePref={themePref} t={t} onChange={onThemeChange} />
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
          {t("welcome.tagline")}
        </p>
      </div>
      <div className="mt-6 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            screen === item.screen ||
            (screen === "project" && item.screen === "projects") ||
            (screen === "task" && item.screen === "today");
          return (
            <button
              type="button"
              key={item.screen}
              onClick={() => onNavigate(item.screen)}
              className={cx(
                "flex w-full items-center gap-3 rounded-[6px] px-3 py-3 text-left text-[13px] font-bold",
                active ? "bg-[var(--green)] text-white" : "hover:bg-[var(--surface-strong)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onNavigate("capture")}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        {t("nav.captureButton")}
      </button>
    </aside>
  );
}
