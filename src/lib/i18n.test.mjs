import assert from "node:assert/strict";
import test from "node:test";

import { detectDeviceLocale, isLocale, translate } from "./i18n.ts";

test("translate returns the requested locale", () => {
  assert.equal(translate("de", "common.back"), "Zurück");
  assert.equal(translate("en", "common.back"), "Back");
});

test("translate interpolates every parameter occurrence", () => {
  const text = translate("de", "sync.failed", {
    label: "Notiz",
    detail: "Timeout",
  });

  assert.ok(text.includes("Notiz"));
  assert.ok(text.includes("Timeout"));
  assert.ok(!text.includes("{label}"));
  assert.ok(!text.includes("{detail}"));

  assert.equal(
    translate("en", "sync.offlinePending.many", { count: 3 }),
    "You are offline. 3 changes are waiting to sync.",
  );
});

test("translate never crashes on a missing key and falls back readably", () => {
  // Dynamisch gebaute Keys (`theme.${option}` u. ä.) umgehen die
  // Typprüfung — zur Laufzeit muss ein Lücken-Key lesbar degradieren.
  const missingKey = "definitiv.kein.key";
  assert.equal(translate("de", missingKey), missingKey);
  assert.equal(translate("en", missingKey), missingKey);
});

test("isLocale accepts exactly de and en", () => {
  assert.equal(isLocale("de"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(isLocale(""), false);
});

test("detectDeviceLocale defaults to de without a window", () => {
  assert.equal(detectDeviceLocale(), "de");
});
