// Relativer Import mit Endung, damit die Node-Tests die Datei laden können.
import { translate, type Locale } from "./i18n.ts";

const WEEKDAYS: Record<Locale, string[]> = {
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

// Liefert den nächsten Montag strikt nach dem Ausgangsdatum
// (für "Nächste Woche" beim Schnell-Verschieben).
export function nextMonday(from: Date) {
  const copy = new Date(from);
  const delta = (1 + 7 - copy.getDay()) % 7 || 7;
  copy.setDate(copy.getDate() + delta);
  return copy;
}

export function formatDateLabel(isoDate: string | null, locale: Locale = "de") {
  if (!isoDate) return translate(locale, "date.none");

  const today = startOfDay(new Date());
  const date = startOfDay(new Date(`${isoDate}T00:00:00`));
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diff === -1) return translate(locale, "date.yesterday");
  if (diff === 0) return translate(locale, "date.today");
  if (diff === 1) return translate(locale, "date.tomorrow");

  const day = WEEKDAYS[locale][date.getDay()];

  if (locale === "en") {
    return `${day}, ${EN_MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  return `${day}, ${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.`;
}

export function isOverdue(isoDate: string | null) {
  if (!isoDate) return false;
  return isoDate < toIsoDate(new Date());
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
