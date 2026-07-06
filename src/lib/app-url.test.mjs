import assert from "node:assert/strict";
import test from "node:test";

import { buildAppUrl, parseAppUrl } from "./app-url.ts";

test("today maps to the bare root url", () => {
  assert.equal(buildAppUrl({ screen: "today", projectId: null, taskId: null }), "/");
  assert.deepEqual(parseAppUrl(""), { screen: "today", projectId: null, taskId: null });
});

test("simple screens round-trip through the url", () => {
  for (const screen of ["capture", "inbox", "projects", "more", "search"]) {
    const url = buildAppUrl({ screen, projectId: null, taskId: null });
    assert.equal(url, `/?s=${screen}`);
    assert.deepEqual(parseAppUrl(new URL(url, "https://example.test").search), {
      screen,
      projectId: null,
      taskId: null,
    });
  }
});

test("project urls carry the project id and require it", () => {
  assert.equal(
    buildAppUrl({ screen: "project", projectId: "p1", taskId: null }),
    "/?s=project&p=p1",
  );
  assert.deepEqual(parseAppUrl("?s=project&p=p1"), {
    screen: "project",
    projectId: "p1",
    taskId: null,
  });
  assert.deepEqual(parseAppUrl("?s=project"), {
    screen: "today",
    projectId: null,
    taskId: null,
  });
});

test("task urls carry task and project id and require the task id", () => {
  assert.equal(
    buildAppUrl({ screen: "task", projectId: "p1", taskId: "t1" }),
    "/?s=task&p=p1&t=t1",
  );
  assert.deepEqual(parseAppUrl("?s=task&p=p1&t=t1"), {
    screen: "task",
    projectId: "p1",
    taskId: "t1",
  });
  assert.deepEqual(parseAppUrl("?s=task"), {
    screen: "today",
    projectId: null,
    taskId: null,
  });
});

test("ids are ignored on screens that do not use them", () => {
  assert.equal(buildAppUrl({ screen: "inbox", projectId: "p1", taskId: "t1" }), "/?s=inbox");
});

test("unknown screens fall back to today", () => {
  assert.deepEqual(parseAppUrl("?s=nonsense&p=x&t=y"), {
    screen: "today",
    projectId: null,
    taskId: null,
  });
});
