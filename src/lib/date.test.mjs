import assert from "node:assert/strict";
import test from "node:test";

import { addDays, nextMonday, toIsoDate } from "./date.ts";

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
