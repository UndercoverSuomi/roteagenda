import assert from "node:assert/strict";
import test from "node:test";

import { applyRealtimeEvent } from "./realtime.ts";

function emptyData() {
  return {
    user: { id: "user-1", name: "Test", email: "test@example.com" },
    settings: { aiModel: "openai-gpt-5-5", locale: "de" },
    projects: [],
    tasks: [],
    notes: [],
    suggestions: [],
  };
}

function taskDocument(overrides = {}) {
  return {
    $id: "doc-1",
    $collectionId: "tasks",
    $databaseId: "roteagenda",
    $createdAt: "2026-07-07T10:00:00.000+00:00",
    $updatedAt: "2026-07-07T10:00:00.000+00:00",
    $permissions: [],
    id: "task-1",
    title: "Flyer besprechen",
    description: "",
    projectId: "project-1",
    status: "open",
    priority: "medium",
    createdBy: "user",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

const CREATE = ["databases.roteagenda.collections.tasks.documents.doc-1.create"];
const UPDATE = ["databases.roteagenda.collections.tasks.documents.doc-1.update"];
const DELETE = ["databases.roteagenda.collections.tasks.documents.doc-1.delete"];

test("create events insert the stripped document with restored null fields", () => {
  const next = applyRealtimeEvent(emptyData(), CREATE, taskDocument());

  assert.equal(next.tasks.length, 1);
  const task = next.tasks[0];
  assert.equal(task.id, "task-1");
  assert.equal(task.dueDate, null);
  assert.equal(task.sourceNoteId, null);
  assert.equal(task.googleSynced, null);
  assert.equal("$id" in task, false);
  assert.equal("$collectionId" in task, false);
});

test("update events replace the matching item", () => {
  const data = applyRealtimeEvent(emptyData(), CREATE, taskDocument());
  const next = applyRealtimeEvent(
    data,
    UPDATE,
    taskDocument({ title: "Flyer fertigstellen", status: "done" }),
  );

  assert.equal(next.tasks.length, 1);
  assert.equal(next.tasks[0].title, "Flyer fertigstellen");
  assert.equal(next.tasks[0].status, "done");
});

test("echoes of unchanged documents return the same state reference", () => {
  const data = applyRealtimeEvent(emptyData(), CREATE, taskDocument());
  const next = applyRealtimeEvent(data, UPDATE, taskDocument());

  assert.equal(next, data);
});

test("echoes with different key order still return the same reference", () => {
  const data = applyRealtimeEvent(emptyData(), CREATE, taskDocument());
  // Lokal gebaute Objekte und Appwrite-Dokumente ordnen Felder verschieden —
  // der Echo-Vergleich darf davon nicht abhängen.
  const reordered = Object.fromEntries(Object.entries(taskDocument()).reverse());
  const next = applyRealtimeEvent(data, UPDATE, reordered);

  assert.equal(next, data);
});

test("delete events remove the item and ignore unknown ids", () => {
  const data = applyRealtimeEvent(emptyData(), CREATE, taskDocument());

  const afterDelete = applyRealtimeEvent(data, DELETE, taskDocument());
  assert.equal(afterDelete.tasks.length, 0);

  const unchanged = applyRealtimeEvent(afterDelete, DELETE, taskDocument());
  assert.equal(unchanged, afterDelete);
});

test("note documents route to the notes list via the legacy collection id", () => {
  const noteDoc = {
    $id: "doc-9",
    $collectionId: "rawNotes",
    $databaseId: "roteagenda",
    $permissions: [],
    id: "note-1",
    content: "Alte Capture-Notiz",
    processed: true,
    createdAt: "2026-07-07T10:00:00.000Z",
  };
  const events = ["databases.roteagenda.collections.rawNotes.documents.doc-9.create"];

  const next = applyRealtimeEvent(emptyData(), events, noteDoc);

  assert.equal(next.notes.length, 1);
  // Neue Felder werden für Bestandsdokumente mit Defaults ergänzt.
  assert.deepEqual(next.notes[0].tags, []);
  assert.equal(next.notes[0].pinned, false);
  assert.equal(next.notes[0].source, "capture");
});

test("events for unknown collections or malformed payloads are ignored", () => {
  const data = emptyData();

  assert.equal(
    applyRealtimeEvent(data, CREATE, taskDocument({ $collectionId: "fremd" })),
    data,
  );
  assert.equal(applyRealtimeEvent(data, CREATE, "kein Objekt"), data);
  assert.equal(applyRealtimeEvent(data, CREATE, null), data);
});
