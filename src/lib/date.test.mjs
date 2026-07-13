import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  formatDateLabel,
  isOverdue,
  nextMonday,
  startOfDay,
  toIsoDate,
} from "./date.ts";

test("toIsoDate formats local dates as YYYY-MM-DD", () => {
  assert.equal(toIsoDate(new Date(2026, 6, 6)), "2026-07-06");
  assert.equal(toIsoDate(new Date(2026, 0, 1)), "2026-01-01");
});

test("addDays rolls over month boundaries", () => {
  assert.equal(toIsoDate(addDays(new Date(2026, 6, 31), 1)), "2026-08-01");
});

test("nextMonday always returns a strictly future Monday", () => {
  // 2026-07-06 ist ein Montag: von dort aus zählt erst der Folgemontag.
  assert.equal(toIsoDate(nextMonday(new Date(2026, 6, 6))), "2026-07-13");
  // Dienstag und Sonntag landen auf demselben Montag.
  assert.equal(toIsoDate(nextMonday(new Date(2026, 6, 7))), "2026-07-13");
  assert.equal(toIsoDate(nextMonday(new Date(2026, 6, 12))), "2026-07-13");
});

test("formatDateLabel names yesterday, today and tomorrow relative to now", () => {
  const today = new Date();

  assert.equal(formatDateLabel(toIsoDate(addDays(today, -1)), "de"), "Gestern");
  assert.equal(formatDateLabel(toIsoDate(today), "de"), "Heute");
  assert.equal(formatDateLabel(toIsoDate(addDays(today, 1)), "en"), "Tomorrow");
  assert.equal(formatDateLabel(null, "de"), "Ohne Termin");
});

test("formatDateLabel renders locale-specific labels for far dates", () => {
  // Weit genug entfernt, dass Gestern/Heute/Morgen nie greifen.
  assert.equal(formatDateLabel("2030-12-24", "de"), "Di, 24.12.");
  assert.equal(formatDateLabel("2030-12-24", "en"), "Tue, Dec 24");
  assert.equal(formatDateLabel("2030-03-05", "de"), "Di, 05.03.");
});

test("isOverdue compares against today and treats missing dates as fine", () => {
  const today = new Date();

  assert.equal(isOverdue(null), false);
  assert.equal(isOverdue(toIsoDate(today)), false);
  assert.equal(isOverdue(toIsoDate(addDays(today, 1))), false);
  assert.equal(isOverdue(toIsoDate(addDays(today, -1))), true);
});

test("startOfDay zeroes the time but keeps the calendar day", () => {
  const date = new Date(2026, 6, 6, 23, 59, 58, 999);
  const start = startOfDay(date);

  assert.equal(toIsoDate(start), "2026-07-06");
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
});
