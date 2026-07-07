import assert from "node:assert/strict";
import test from "node:test";

import { buildAppUrl, parseAppUrl } from "./app-url.ts";

const EMPTY = { projectId: null, taskId: null, noteId: null };

test("today maps to the bare root url", () => {
  assert.equal(
    buildAppUrl({ screen: "today", projectId: null, taskId: null, noteId: null }),
    "/",
  );
  assert.deepEqual(parseAppUrl(""), { screen: "today", ...EMPTY });
});

test("simple screens round-trip through the url", () => {
  for (const screen of ["capture", "inbox", "notes", "projects", "more", "search"]) {
    const url = buildAppUrl({ screen, projectId: null, taskId: null, noteId: null });
    assert.equal(url, `/?s=${screen}`);
    assert.deepEqual(parseAppUrl(new URL(url, "https://example.test").search), {
      screen,
      ...EMPTY,
    });
  }
});

test("project urls carry the project id and require it", () => {
  assert.equal(
    buildAppUrl({ screen: "project", projectId: "p1", taskId: null, noteId: null }),
    "/?s=project&p=p1",
  );
  assert.deepEqual(parseAppUrl("?s=project&p=p1"), {
    screen: "project",
    projectId: "p1",
    taskId: null,
    noteId: null,
  });
  assert.deepEqual(parseAppUrl("?s=project"), { screen: "today", ...EMPTY });
});

test("task urls carry task and project id and require the task id", () => {
  assert.equal(
    buildAppUrl({ screen: "task", projectId: "p1", taskId: "t1", noteId: null }),
    "/?s=task&p=p1&t=t1",
  );
  assert.deepEqual(parseAppUrl("?s=task&p=p1&t=t1"), {
    screen: "task",
    projectId: "p1",
    taskId: "t1",
    noteId: null,
  });
  assert.deepEqual(parseAppUrl("?s=task"), { screen: "today", ...EMPTY });
});

test("note urls carry the note id and require it", () => {
  assert.equal(
    buildAppUrl({ screen: "note", projectId: null, taskId: null, noteId: "n1" }),
    "/?s=note&n=n1",
  );
  assert.deepEqual(parseAppUrl("?s=note&n=n1"), {
    screen: "note",
    projectId: null,
    taskId: null,
    noteId: "n1",
  });
  assert.deepEqual(parseAppUrl("?s=note"), { screen: "today", ...EMPTY });
});

test("ids are ignored on screens that do not use them", () => {
  assert.equal(
    buildAppUrl({ screen: "inbox", projectId: "p1", taskId: "t1", noteId: "n1" }),
    "/?s=inbox",
  );
});

test("unknown screens fall back to today", () => {
  assert.deepEqual(parseAppUrl("?s=nonsense&p=x&t=y&n=z"), {
    screen: "today",
    ...EMPTY,
  });
});
