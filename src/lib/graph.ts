// Baut aus Notizen, Tags und Projekten den Wissensgraphen (Obsidian-artig)
// und simuliert das Kraft-Layout. Pure Funktionen mit relativen Imports,
// damit der Node-Test-Runner sie direkt laden kann — kein DOM, kein Zufall
// (Jitter kommt deterministisch aus den IDs).

import type { Note, Project } from "./types.ts";

export type GraphNodeKind = "note" | "tag";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  // Notiz-ID bzw. Tag-Name ohne Präfix.
  refId: string;
  label: string;
  // Projektfarbe der Notiz; null = neutral (Render entscheidet per Theme).
  color: string | null;
  degree: number;
  radius: number;
};

export type GraphLinkKind = "related" | "tag";

export type GraphLink = {
  source: string;
  target: string;
  kind: GraphLinkKind;
};

export type NoteGraph = { nodes: GraphNode[]; links: GraphLink[] };

export type BuildGraphOptions = {
  includeTags?: boolean;
  hideOrphans?: boolean;
};

export function noteNodeId(noteId: string) {
  return `note:${noteId}`;
}

export function tagNodeId(tag: string) {
  return `tag:${tag}`;
}

export function buildNoteGraph(
  notes: Note[],
  projects: Project[],
  { includeTags = true, hideOrphans = false }: BuildGraphOptions = {},
): NoteGraph {
  const colorByProject = new Map(projects.map((project) => [project.id, project.color]));
  const noteIds = new Set(notes.map((note) => note.id));

  const links: GraphLink[] = [];
  const seenRelated = new Set<string>();

  for (const note of notes) {
    for (const relatedId of note.relatedNoteIds) {
      // Verweise auf gelöschte Notizen und Selbstbezüge überspringen.
      if (relatedId === note.id || !noteIds.has(relatedId)) continue;

      // Verlinkungen sind ungerichtet: a→b und b→a sind dieselbe Kante.
      const key = [note.id, relatedId].sort().join("→");
      if (seenRelated.has(key)) continue;
      seenRelated.add(key);

      links.push({
        source: noteNodeId(note.id),
        target: noteNodeId(relatedId),
        kind: "related",
      });
    }
  }

  const tagNames = new Set<string>();
  if (includeTags) {
    for (const note of notes) {
      for (const tag of note.tags) {
        const name = tag.trim();
        if (!name) continue;
        tagNames.add(name);
        links.push({
          source: noteNodeId(note.id),
          target: tagNodeId(name),
          kind: "tag",
        });
      }
    }
  }

  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const note of notes) {
    const id = noteNodeId(note.id);
    const nodeDegree = degree.get(id) ?? 0;
    if (hideOrphans && nodeDegree === 0) continue;

    nodes.push({
      id,
      kind: "note",
      refId: note.id,
      label: (note.title || note.content).trim().slice(0, 60) || "…",
      color: note.projectId ? (colorByProject.get(note.projectId) ?? null) : null,
      degree: nodeDegree,
      radius: 4.5 + Math.min(11, Math.sqrt(nodeDegree) * 2.6),
    });
  }

  for (const name of [...tagNames].sort()) {
    const id = tagNodeId(name);
    const nodeDegree = degree.get(id) ?? 0;
    nodes.push({
      id,
      kind: "tag",
      refId: name,
      label: `#${name}`,
      color: null,
      degree: nodeDegree,
      radius: 3 + Math.min(6, Math.sqrt(nodeDegree) * 1.1),
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    // Bei ausgeblendeten Orphans dürfen keine Kanten ins Leere zeigen.
    links: links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target)),
  };
}

// ── Kraft-Simulation ─────────────────────────────────────────────────

export type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Festgehalten (Drag): Position wird nicht simuliert.
  fx: number | null;
  fy: number | null;
};

export type SimLink = { a: number; b: number; kind: GraphLinkKind };

// Deterministischer Jitter aus der ID, damit identische Daten identische
// Start-Layouts ergeben (kein Math.random — auch wegen Testbarkeit).
function hashJitter(id: string, salt: number) {
  let hash = salt;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return ((hash % 1000) / 1000 - 0.5) * 24;
}

// Startpositionen: bekannte Knoten behalten ihren Platz, neue entstehen
// neben einem verbundenen Nachbarn oder auf einer Goldwinkel-Spirale.
export function initSimNodes(
  graph: NoteGraph,
  previous: ReadonlyMap<string, { x: number; y: number }>,
): SimNode[] {
  const neighborPos = new Map<string, { x: number; y: number }>();

  for (const link of graph.links) {
    for (const [self, other] of [
      [link.source, link.target],
      [link.target, link.source],
    ]) {
      const known = previous.get(other);
      if (known && !previous.has(self) && !neighborPos.has(self)) {
        neighborPos.set(self, known);
      }
    }
  }

  return graph.nodes.map((node, index) => {
    const kept = previous.get(node.id);
    const near = neighborPos.get(node.id);
    const spiralRadius = 30 * Math.sqrt(index + 1);
    const angle = (index + 1) * 2.399963;

    const x = kept?.x ?? (near ? near.x + hashJitter(node.id, 7) : Math.cos(angle) * spiralRadius);
    const y = kept?.y ?? (near ? near.y + hashJitter(node.id, 13) : Math.sin(angle) * spiralRadius);

    return { ...node, x, y, vx: 0, vy: 0, fx: null, fy: null };
  });
}

export function resolveLinks(nodes: SimNode[], links: GraphLink[]): SimLink[] {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));

  return links.flatMap((link) => {
    const a = indexById.get(link.source);
    const b = indexById.get(link.target);
    return a === undefined || b === undefined ? [] : [{ a, b, kind: link.kind }];
  });
}

const REPULSION = 2200;
const MIN_DISTANCE_SQ = 64;
const LINK_REST: Record<GraphLinkKind, number> = { related: 74, tag: 52 };
const LINK_STRENGTH: Record<GraphLinkKind, number> = { related: 0.035, tag: 0.05 };
const GRAVITY = 0.012;
const FRICTION = 0.8;

// Ein Simulationsschritt (mutiert die Knoten). alpha ∈ (0..1] skaliert alle
// Kräfte; der Aufrufer lässt es pro Frame abklingen, bis das Layout ruht.
export function simulationStep(nodes: SimNode[], links: SimLink[], alpha: number) {
  // Abstoßung zwischen allen Paaren (O(n²) — für einige hundert Knoten ok).
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;

      if (distSq < 0.01) {
        // Exakt übereinander: deterministisch minimal auseinanderschieben.
        dx = hashJitter(a.id, i) * 0.01 + 0.1;
        dy = hashJitter(b.id, j) * 0.01 + 0.1;
        distSq = dx * dx + dy * dy;
      }

      const clamped = Math.max(distSq, MIN_DISTANCE_SQ);
      const force = (REPULSION * alpha) / clamped;
      const dist = Math.sqrt(distSq);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Federkraft entlang der Kanten.
  for (const link of links) {
    const a = nodes[link.a];
    const b = nodes[link.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
    const rest = LINK_REST[link.kind] + a.radius + b.radius;
    const force = (dist - rest) * LINK_STRENGTH[link.kind] * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Sanfte Zentrierung plus Integration mit Reibung.
  for (const node of nodes) {
    node.vx -= node.x * GRAVITY * alpha;
    node.vy -= node.y * GRAVITY * alpha;

    node.vx *= FRICTION;
    node.vy *= FRICTION;
    node.x += node.vx;
    node.y += node.vy;

    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
    }
  }
}
