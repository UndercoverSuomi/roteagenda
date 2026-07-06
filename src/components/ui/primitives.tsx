import { cx } from "@/components/app-helpers";

export function WorkSurface({
  children,
  hasBottomNav,
}: {
  children: React.ReactNode;
  hasBottomNav: boolean;
}) {
  return (
    <section className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[var(--paper-soft)] shadow-[0_18px_48px_rgb(31_24_14_/_10%)] md:min-h-[calc(100vh-48px)] md:max-w-none md:rounded-[14px] md:border md:border-[var(--line)] md:shadow-none">
      <div
        className={cx(
          "flex min-h-0 flex-1 flex-col pt-4 md:pt-0",
          hasBottomNav && "pb-[92px] md:pb-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function AppShellMessage({
  title,
  text,
  actionLabel,
  onAction,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Rote Agenda
        </p>
        <h1 className="mt-3 font-display text-[30px] font-bold">{title}</h1>
        <p className="mt-4 text-[14px] leading-7 text-[var(--muted)]">{text}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 w-full rounded-[5px] bg-[var(--green)] px-4 py-3 text-[13px] font-bold text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

export function ScreenHeader({
  title,
  leftIcon,
  rightIcon,
  extraRightIcon,
  leftLabel,
  rightLabel,
  extraRightLabel,
  onLeft,
  onRight,
  onExtraRight,
}: {
  title: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  // Optionaler zweiter Icon-Slot links neben dem rechten Icon.
  extraRightIcon?: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  extraRightLabel?: string;
  onLeft?: () => void;
  onRight?: () => void;
  onExtraRight?: () => void;
}) {
  const leftSlotClass = "grid h-10 w-10 place-items-center text-[var(--ink)]";
  const rightSlotClass = `${leftSlotClass} justify-self-end`;

  function renderSlot(
    icon: React.ReactNode,
    onClick: (() => void) | undefined,
    className: string,
    label?: string,
  ) {
    if (!icon) {
      return <span className={className} aria-hidden="true" />;
    }

    if (!onClick) {
      return (
        <span className={className} aria-hidden="true">
          {icon}
        </span>
      );
    }

    return (
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        {icon}
      </button>
    );
  }

  return (
    <header
      className={cx(
        "grid h-10 items-center",
        extraRightIcon ? "grid-cols-[44px_1fr_44px_44px]" : "grid-cols-[44px_1fr_44px]",
      )}
    >
      {renderSlot(leftIcon, onLeft, leftSlotClass, leftLabel)}
      <h1 className="font-display text-[25px] font-bold leading-none">{title}</h1>
      {extraRightIcon
        ? renderSlot(extraRightIcon, onExtraRight, rightSlotClass, extraRightLabel)
        : null}
      {renderSlot(rightIcon, onRight, rightSlotClass, rightLabel)}
    </header>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-[var(--track)]", className)}>
      <div
        className="h-full rounded-full bg-[var(--red)] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-[12px] font-bold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
      <p className="font-display text-[18px] font-bold">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}
