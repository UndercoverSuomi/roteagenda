const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function nextWeekday(from: Date, targetDay: number) {
  const copy = new Date(from);
  const delta = (targetDay + 7 - copy.getDay()) % 7 || 7;
  copy.setDate(copy.getDate() + delta);
  return copy;
}

export function formatDateLabel(isoDate: string | null) {
  if (!isoDate) return "Ohne Termin";

  const today = startOfDay(new Date());
  const date = startOfDay(new Date(`${isoDate}T00:00:00`));
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";

  const day = WEEKDAYS[date.getDay()];
  return `${day}, ${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.`;
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function fixedToday() {
  return new Date("2026-06-24T12:00:00");
}
