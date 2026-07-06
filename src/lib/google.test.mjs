import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarTemplateUrl } from "./google.ts";

test("calendar template url contains title, details and all-day range", () => {
  const url = buildCalendarTemplateUrl({
    title: "Angebot fertigstellen",
    description: "Preisoptionen & nächste Schritte",
    dueDate: "2026-07-10",
  });

  assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
  assert.match(url, /action=TEMPLATE/);
  // Ganztägiger Termin: Ende ist der Folgetag (exklusiv).
  assert.match(url, /dates=20260710%2F20260711/);
  assert.match(url, /text=Angebot\+fertigstellen/);
  assert.match(url, /details=Preisoptionen/);
});

test("calendar template url handles month rollover for the end date", () => {
  const url = buildCalendarTemplateUrl({
    title: "Monatsende",
    description: "",
    dueDate: "2026-07-31",
  });

  assert.match(url, /dates=20260731%2F20260801/);
  assert.ok(!url.includes("details="));
});
