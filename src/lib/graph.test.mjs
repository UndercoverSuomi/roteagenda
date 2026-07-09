import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoteGraph,
  initSimNodes,
  noteNodeId,
  resolveLinks,
  simulationStep,
  tagNodeId,
} from "./graph.ts";

function note(id, overrides = {}) {
  return {
    id,
    title: `Titel ${id}`,
    content: `Inhalt ${id}`,
    enhanced: "",
    tags: [],
    projectId: null,
    relatedNoteIds: [],
    source: "manual",
    sourceUrl: null,
    pinned: false,
    processed: true,
    pendingFileId: null,
    processingError: null,
    createdAt: "2026-07-09T10:00:00.000Z",
    updatedAt: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

const PROJECTS = [
  {
    id: "p1",
    title: "Projekt",
    description: "",
    keywords: [],
    color: "#2f6d5a",
    progress: 0,
    aiEnabled: true,
    createdAt: "2026-07-09T10:00:00.000Z",
    updatedAt: "2026-07-09T10:00:00.000Z",
  },
];

test("bidirectional and duplicate related links collapse into one edge", () => {
  const graph = buildNoteGraph(
    [
      note("a", { relatedNoteIds: ["b", "b"] }),
      note("b", { relatedNoteIds: ["a"] }),
    ],
    [],
  );

  const related = graph.links.filter((link) => link.kind === "related");
  assert.equal(related.length, 1);
  assert.deepEqual([related[0].source, related[0].target].sort(), [
    noteNodeId("a"),
    noteNodeId("b"),
  ]);
});

test("links to deleted notes and to self are dropped", () => {
  const graph = buildNoteGraph(
    [note("a", { relatedNoteIds: ["a", "geloescht"] }), note("b")],
    [],
  );

  assert.equal(graph.links.length, 0);
  assert.equal(graph.nodes.length, 2);
});

test("tags become hub nodes connecting their notes", () => {
  const graph = buildNoteGraph(
    [note("a", { tags: ["idee"] }), note("b", { tags: ["idee", "reise"] })],
    [],
  );

  const tagNodes = graph.nodes.filter((node) => node.kind === "tag");
  assert.deepEqual(
    tagNodes.map((node) => node.refId),
    ["idee", "reise"],
  );
  const idee = tagNodes.find((node) => node.refId === "idee");
  assert.equal(idee.degree, 2);
  assert.equal(idee.label, "#idee");

  const withoutTags = buildNoteGraph([note("a", { tags: ["idee"] })], [], {
    includeTags: false,
  });
  assert.equal(withoutTags.nodes.filter((node) => node.kind === "tag").length, 0);
  assert.equal(withoutTags.links.length, 0);
});

test("hideOrphans removes unlinked notes but keeps connected ones", () => {
  const graph = buildNoteGraph(
    [
      note("a", { relatedNoteIds: ["b"] }),
      note("b"),
      note("einsam"),
    ],
    [],
    { hideOrphans: true },
  );

  assert.deepEqual(
    graph.nodes.map((node) => node.refId).sort(),
    ["a", "b"],
  );
  // Keine Kante darf auf einen entfernten Knoten zeigen.
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.links.every((link) => ids.has(link.source) && ids.has(link.target)));
});

test("note nodes carry their project color; higher degree grows the radius", () => {
  const graph = buildNoteGraph(
    [
      note("a", { projectId: "p1", relatedNoteIds: ["b", "c"] }),
      note("b"),
      note("c"),
    ],
    PROJECTS,
  );

  const a = graph.nodes.find((node) => node.refId === "a");
  const b = graph.nodes.find((node) => node.refId === "b");
  assert.equal(a.color, "#2f6d5a");
  assert.equal(b.color, null);
  assert.ok(a.radius > b.radius);
});

test("initSimNodes keeps known positions and is deterministic", () => {
  const graph = buildNoteGraph([note("a", { relatedNoteIds: ["b"] }), note("b")], []);

  const first = initSimNodes(graph, new Map());
  const second = initSimNodes(graph, new Map());
  assert.deepEqual(
    first.map(({ x, y }) => ({ x, y })),
    second.map(({ x, y }) => ({ x, y })),
  );

  const kept = initSimNodes(graph, new Map([[noteNodeId("a"), { x: 123, y: -45 }]]));
  const a = kept.find((node) => node.id === noteNodeId("a"));
  assert.equal(a.x, 123);
  assert.equal(a.y, -45);
});

test("new nodes spawn near an already placed neighbor", () => {
  const graph = buildNoteGraph([note("a", { relatedNoteIds: ["b"] }), note("b")], []);
  const nodes = initSimNodes(graph, new Map([[noteNodeId("b"), { x: 400, y: 400 }]]));
  const a = nodes.find((node) => node.id === noteNodeId("a"));

  assert.ok(Math.abs(a.x - 400) < 30);
  assert.ok(Math.abs(a.y - 400) < 30);
});

test("the simulation pulls linked nodes together and repels unlinked ones", () => {
  const graph = buildNoteGraph(
    [note("a", { relatedNoteIds: ["b"] }), note("b"), note("c")],
    [],
  );
  const nodes = initSimNodes(graph, new Map());
  const links = resolveLinks(nodes, graph.links);

  const a = nodes.find((node) => node.id === noteNodeId("a"));
  const b = nodes.find((node) => node.id === noteNodeId("b"));
  a.x = -600;
  a.y = 0;
  b.x = 600;
  b.y = 0;

  let alpha = 1;
  for (let i = 0; i < 300; i++) {
    simulationStep(nodes, links, alpha);
    alpha = Math.max(alpha * 0.99, 0.05);
  }

  const distLinked = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(distLinked < 400, `verbundene Knoten rücken zusammen (${distLinked})`);
  assert.ok(distLinked > 20, "aber kollabieren nicht aufeinander");

  // Alle Knoten bleiben endlich (keine explodierende Simulation).
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
  }
});

test("dragged nodes stay pinned during simulation", () => {
  const graph = buildNoteGraph([note("a", { relatedNoteIds: ["b"] }), note("b")], []);
  const nodes = initSimNodes(graph, new Map());
  const links = resolveLinks(nodes, graph.links);
  const a = nodes.find((node) => node.id === noteNodeId("a"));
  a.fx = 250;
  a.fy = -80;

  for (let i = 0; i < 50; i++) {
    simulationStep(nodes, links, 0.5);
  }

  assert.equal(a.x, 250);
  assert.equal(a.y, -80);
});

test("tag node ids are namespaced and cannot collide with note ids", () => {
  assert.notEqual(tagNodeId("a"), noteNodeId("a"));
});
