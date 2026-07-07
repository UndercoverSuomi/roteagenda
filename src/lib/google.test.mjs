import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarTemplateUrl } from "./google.ts";

test("calendar template url contains title, details and all-day range", () => {
  const url = buildCalendarTemplateUrl({
    title: "Angebot fertigstellen",
    description: "Preisoptionen & nächste Schritte",
    start: "2026-07-10",
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
    start: "2026-07-31",
  });

  assert.match(url, /dates=20260731%2F20260801/);
  assert.ok(!url.includes("details="));
});

test("timed events default to one hour and keep the local time", () => {
  const url = buildCalendarTemplateUrl({
    title: "Arzttermin Praxis41",
    description: "Krankenkassenkarte mitnehmen",
    start: "2026-07-08T09:00",
  });

  assert.match(url, /dates=20260708T090000%2F20260708T100000/);
});

test("timed events honour an explicit end and roll over midnight", () => {
  const explicit = buildCalendarTemplateUrl({
    title: "Workshop",
    description: "",
    start: "2026-07-08T09:00",
    end: "2026-07-08T11:30",
  });
  assert.match(explicit, /dates=20260708T090000%2F20260708T113000/);

  const midnight = buildCalendarTemplateUrl({
    title: "Spätschicht",
    description: "",
    start: "2026-07-08T23:30",
  });
  assert.match(midnight, /dates=20260708T233000%2F20260709T003000/);
});
