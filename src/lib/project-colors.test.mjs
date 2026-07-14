import assert from "node:assert/strict";
import test from "node:test";

import {
  colorForId,
  pickRelatedProjectColor,
  PROJECT_COLOR_FAMILIES,
  PROJECT_COLORS,
  withAlpha,
} from "./project-colors.ts";

const RED = PROJECT_COLOR_FAMILIES[0];
const TERRACOTTA = PROJECT_COLOR_FAMILIES[1];

test("the palette keeps the eight original colors as family anchors", () => {
  for (const legacy of [
    "#d84b3f",
    "#2f6d5a",
    "#c98a2d",
    "#4a6fa5",
    "#8a4a6f",
    "#3a8a8c",
    "#7a8a3a",
    "#9a6b4f",
  ]) {
    assert.ok(PROJECT_COLORS.includes(legacy), `${legacy} fehlt in der Palette`);
  }
  // Deutlich größere Auswahl, alle Töne eindeutig.
  assert.ok(PROJECT_COLORS.length >= 30);
  assert.equal(new Set(PROJECT_COLORS).size, PROJECT_COLORS.length);
});

test("related projects get a tone from the same color family", () => {
  const color = pickRelatedProjectColor([RED[0]], [RED[0]]);
  assert.ok(RED.includes(color), `${color} sollte zur Rot-Familie gehören`);
  assert.notEqual(color, RED[0]);
});

test("a full family spills over to the neighbouring family", () => {
  // Alle Rot-Töne belegt: das nächste Coding-Projekt bekommt Terrakotta.
  const color = pickRelatedProjectColor([...RED], [RED[0]]);
  assert.ok(TERRACOTTA.includes(color), `${color} sollte zur Nachbar-Familie gehören`);
});

test("unrelated projects get a color far away from the used families", () => {
  // Rot ist belegt → ohne Verwandtschaft soll eine weit entfernte
  // Familie gewinnen, nicht der Nachbar Terrakotta.
  const color = pickRelatedProjectColor([RED[0]]);
  const family = PROJECT_COLOR_FAMILIES.findIndex((tones) => tones.includes(color));
  const count = PROJECT_COLOR_FAMILIES.length;
  const distance = Math.min(Math.abs(family - 0), count - Math.abs(family - 0));
  assert.ok(distance >= 3, `Familie ${family} liegt zu nah an Rot (Distanz ${distance})`);
});

test("colors stay unique until the whole palette is exhausted", () => {
  const used = [];
  for (let i = 0; i < PROJECT_COLORS.length; i++) {
    const color = pickRelatedProjectColor(used);
    assert.ok(!used.includes(color), `Ton ${color} wurde doppelt vergeben (Schritt ${i})`);
    used.push(color);
  }
  // Erst wenn wirklich alles belegt ist, wird wiederverwendet.
  assert.ok(PROJECT_COLORS.includes(pickRelatedProjectColor(used)));
});

test("legacy helpers still work", () => {
  assert.ok(PROJECT_COLORS.includes(colorForId("project-abc")));
  assert.equal(withAlpha("#d84b3f", 0.5), "rgba(216, 75, 63, 0.5)");
  assert.equal(withAlpha("kaputt", 0.5), null);
});
