import assert from "node:assert/strict";
import test from "node:test";

import { documentToItem, toAppwriteData } from "./appwrite-documents.ts";

test("documentToItem strips appwrite metadata", () => {
  const item = documentToItem("tasks", {
    $id: "doc-1",
    $sequence: 7,
    $collectionId: "tasks",
    $databaseId: "roteagenda",
    $createdAt: "2026-07-01T10:00:00.000+00:00",
    $updatedAt: "2026-07-01T10:00:00.000+00:00",
    $permissions: ['read("user:u1")'],
    id: "task-1",
    title: "Angebot schreiben",
    description: "",
    projectId: "project-1",
    status: "open",
    priority: "high",
    dueDate: "2026-07-14",
    sourceNoteId: null,
    createdBy: "user",
    googleSynced: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
  });

  assert.equal(item.id, "task-1");
  for (const key of Object.keys(item)) {
    assert.ok(!key.startsWith("$"), `${key} sollte entfernt sein`);
  }
});

test("legacy project documents get defaults for description and keywords", () => {
  const project = documentToItem("projects", {
    id: "project-1",
    title: "Umzug",
    progress: 40,
    aiEnabled: true,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  });

  assert.equal(project.description, "");
  assert.deepEqual(project.keywords, []);
  // Fehlende Farbe wird deterministisch aus der ID abgeleitet.
  assert.equal(typeof project.color, "string");
  assert.ok(project.color.length > 0);
  // Ein unbewachter .map()-Zugriff darf auf Altdaten nie crashen.
  assert.deepEqual(
    project.keywords.map((keyword) => keyword.toUpperCase()),
    [],
  );
});

test("legacy task documents get an empty description", () => {
  const task = documentToItem("tasks", {
    id: "task-1",
    title: "Karton besorgen",
    projectId: "project-1",
    status: "open",
    priority: "low",
    createdBy: "ai",
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  });

  assert.equal(task.description, "");
  assert.equal(task.dueDate, null);
  assert.equal(task.sourceNoteId, null);
  assert.equal(task.googleSynced, null);
});

test("legacy suggestion documents get text and reasoning defaults", () => {
  const suggestion = documentToItem("suggestions", {
    id: "suggestion-1",
    rawNoteId: "note-1",
    suggestedTitle: "Zahnarzt anrufen",
    confidence: 0.9,
    priority: "medium",
    needsReview: false,
    state: "pending",
    createdAt: "2026-06-01T09:00:00.000Z",
  });

  assert.equal(suggestion.kind, "task");
  assert.equal(suggestion.suggestedDescription, "");
  assert.equal(suggestion.reasoning, "");
  assert.equal(suggestion.suggestedProjectId, null);
  assert.deepEqual(suggestion.suggestedNoteIds, []);
  assert.equal(suggestion.eventStart, null);
  assert.equal(suggestion.eventEnd, null);
});

test("legacy capture-era notes get all newer fields as defaults", () => {
  const note = documentToItem("notes", {
    id: "note-1",
    content: "Rohtext",
    processed: false,
    createdAt: "2026-05-01T08:00:00.000Z",
  });

  assert.equal(note.title, "");
  assert.equal(note.enhanced, "");
  assert.deepEqual(note.tags, []);
  assert.deepEqual(note.relatedNoteIds, []);
  assert.equal(note.source, "capture");
  assert.equal(note.pinned, false);
  assert.equal(note.mediaFileId, null);
  // updatedAt fällt auf createdAt zurück.
  assert.equal(note.updatedAt, "2026-05-01T08:00:00.000Z");
});

test("deep insight documents get defaults for all newer fields", () => {
  const insights = documentToItem("deepInsights", {
    id: "insights-1",
    createdAt: "2026-07-14T10:00:00.000Z",
  });

  assert.equal(insights.status, "ready");
  assert.equal(insights.summary, "");
  assert.deepEqual(insights.clusters, []);
  assert.deepEqual(insights.anomalies, []);
  assert.deepEqual(insights.gaps, []);
  assert.deepEqual(insights.suggestions, []);
  assert.equal(insights.error, null);
  assert.equal(insights.noteCount, 0);
  assert.equal(insights.updatedAt, "2026-07-14T10:00:00.000Z");
});

test("toAppwriteData drops null fields but keeps empty strings and false", () => {
  const data = toAppwriteData({
    id: "note-1",
    title: "",
    pinned: false,
    projectId: null,
    tags: [],
    sourceUrl: null,
  });

  assert.deepEqual(data, { id: "note-1", title: "", pinned: false, tags: [] });
});

test("restore and toAppwriteData are symmetric for nullable fields", () => {
  const stored = toAppwriteData({
    id: "task-1",
    title: "Angebot",
    description: "",
    projectId: "project-1",
    status: "open",
    priority: "high",
    dueDate: null,
    sourceNoteId: null,
    createdBy: "user",
    googleSynced: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
  });
  assert.equal("dueDate" in stored, false);

  const roundTripped = documentToItem("tasks", stored);
  assert.equal(roundTripped.dueDate, null);
  assert.equal(roundTripped.googleSynced, null);
});
