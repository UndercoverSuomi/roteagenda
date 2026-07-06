// Kurzlebiger Toast nach destruktiven Aktionen; die Aktion lässt sich
// rückgängig machen, bis der Toast automatisch verschwindet.
export function UndoToast({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[60] flex justify-center px-6 md:bottom-8">
      <div className="pointer-events-auto flex items-center gap-4 rounded-[6px] bg-[var(--green)] px-4 py-3 text-[13px] text-white shadow-lg shadow-black/25">
        <span>{message}</span>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 font-bold uppercase tracking-[0.03em] underline underline-offset-2"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
