import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { clearQueuedOps, readQueuedOps, writeQueuedOps } from "./offline-store.ts";

// localStorage-Shim, damit der Store im Node-Test-Runner läuft.
function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

beforeEach(() => {
  globalThis.window = { localStorage: fakeLocalStorage() };
});

const entry = (id, n) => ({ id, label: `op-${n}`, op: { kind: "delete", collection: "tasks", id: `t-${n}` } });

test("writeQueuedOps preserves entries owned by another tab", () => {
  // Tab B legt offline einen Eintrag an.
  writeQueuedOps("user-1", [entry("op-b1", 1)], new Set(["op-b1"]));
  // Tab A (kennt nur seine eigene ID) schreibt seinen Stand.
  writeQueuedOps("user-1", [entry("op-a1", 2)], new Set(["op-a1"]));

  const merged = readQueuedOps();
  assert.equal(merged.userId, "user-1");
  assert.deepEqual(
    merged.entries.map((item) => item.id),
    ["op-b1", "op-a1"],
  );

  // Tab A arbeitet seinen Eintrag ab: nur op-a1 verschwindet, op-b1 bleibt.
  writeQueuedOps("user-1", [], new Set(["op-a1"]));
  assert.deepEqual(
    readQueuedOps().entries.map((item) => item.id),
    ["op-b1"],
  );
});

test("writeQueuedOps replaces the queue of a different user completely", () => {
  writeQueuedOps("user-1", [entry("op-b1", 1)], new Set(["op-b1"]));
  writeQueuedOps("user-2", [entry("op-c1", 2)], new Set(["op-c1"]));

  const stored = readQueuedOps();
  assert.equal(stored.userId, "user-2");
  assert.deepEqual(
    stored.entries.map((item) => item.id),
    ["op-c1"],
  );
});

test("readQueuedOps assigns ids to legacy entries and filters corrupt ones", () => {
  window.localStorage.setItem(
    "rote-agenda-queue",
    JSON.stringify({
      userId: "user-1",
      entries: [
        { label: "alt", op: { kind: "deleteAll" } },
        { label: "kaputt", op: "kein-objekt" },
        "unsinn",
        { id: "op-ok", label: "neu", op: { kind: "deleteAll" } },
      ],
    }),
  );

  const stored = readQueuedOps();
  assert.equal(stored.entries.length, 2);
  assert.match(stored.entries[0].id, /^op-legacy-/);
  assert.equal(stored.entries[1].id, "op-ok");
});

test("readQueuedOps rejects payloads without user or entries", () => {
  window.localStorage.setItem("rote-agenda-queue", JSON.stringify({ entries: [] }));
  assert.equal(readQueuedOps(), null);

  window.localStorage.setItem("rote-agenda-queue", "kein json {");
  assert.equal(readQueuedOps(), null);
});

test("clearQueuedOps removes the stored queue", () => {
  writeQueuedOps("user-1", [entry("op-a1", 1)], new Set(["op-a1"]));
  clearQueuedOps();
  assert.equal(readQueuedOps(), null);
});
