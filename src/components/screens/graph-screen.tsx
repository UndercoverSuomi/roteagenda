"use client";

import { ArrowLeft, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-helpers";
import { EmptyState, ScreenHeader } from "@/components/ui/primitives";
import {
  buildNoteGraph,
  initSimNodes,
  resolveLinks,
  simulationStep,
  type SimLink,
  type SimNode,
} from "@/lib/graph";
import type { Translator } from "@/lib/i18n";
import { withAlpha } from "@/lib/project-colors";
import type { Note, Project } from "@/lib/types";

const PREFS_KEY = "rote-agenda-graph";
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

type GraphPrefs = { includeTags: boolean; hideOrphans: boolean };

// Nur clientseitig gerendert (hinter dem Auth-Check), daher ist der
// localStorage-Initializer hydration-sicher.
function readPrefs(): GraphPrefs {
  if (typeof window === "undefined") return { includeTags: true, hideOrphans: false };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<GraphPrefs>) : {};
    return {
      includeTags: parsed.includeTags !== false,
      hideOrphans: parsed.hideOrphans === true,
    };
  } catch {
    return { includeTags: true, hideOrphans: false };
  }
}

type View = { panX: number; panY: number; k: number };
type DragState =
  | { kind: "node"; index: number; moved: boolean; startX: number; startY: number }
  | { kind: "pan"; moved: boolean; startX: number; startY: number; panX: number; panY: number };

export function GraphScreen({
  notes,
  projects,
  t,
  onBack,
  onOpenNote,
}: {
  notes: Note[];
  projects: Project[];
  t: Translator;
  onBack: () => void;
  onOpenNote: (noteId: string) => void;
}) {
  const [prefs, setPrefs] = useState<GraphPrefs>(() => readPrefs());

  const graph = useMemo(
    () =>
      buildNoteGraph(notes, projects, {
        includeTags: prefs.includeTags,
        hideOrphans: prefs.hideOrphans,
      }),
    [notes, projects, prefs],
  );

  // Legende: nur Projekte, die im Graphen tatsächlich vorkommen.
  const legendProjects = useMemo(() => {
    const used = new Set(
      notes.flatMap((note) => (note.projectId ? [note.projectId] : [])),
    );
    return projects.filter((project) => used.has(project.id));
  }, [notes, projects]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const viewRef = useRef<View>({ panX: 0, panY: 0, k: 1 });
  const alphaRef = useRef(1);
  const needsDrawRef = useRef(true);
  const fitDoneRef = useRef(false);
  const hoverRef = useRef(-1);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number } | null>(null);
  // "Ansicht einpassen" lebt im Render-Effekt; Header-Button ruft es hierüber.
  const fitRef = useRef<() => void>(() => undefined);

  function updatePrefs(patch: Partial<GraphPrefs>) {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Ohne localStorage gilt die Einstellung nur für diese Sitzung.
      }
      return next;
    });
  }

  // Graph-Daten in die Simulation übernehmen; bekannte Knoten behalten
  // ihre Position, damit Updates das Layout nicht zerwürfeln.
  useEffect(() => {
    for (const node of nodesRef.current) {
      positionsRef.current.set(node.id, { x: node.x, y: node.y });
    }
    nodesRef.current = initSimNodes(graph, positionsRef.current);
    linksRef.current = resolveLinks(nodesRef.current, graph.links);
    hoverRef.current = -1;
    alphaRef.current = 1;
    needsDrawRef.current = true;
  }, [graph]);

  // Der Canvas existiert nur, wenn es Notizen gibt — der Effekt muss neu
  // laufen, sobald der Zweig (Leer-Zustand ↔ Graph) wechselt, sonst hängen
  // Observer und Render-Schleife an einem verwaisten DOM-Knoten.
  const hasCanvas = notes.length > 0;

  // Render-Schleife: Simulation nur solange sie "heiß" ist, Zeichnen nur
  // bei Änderungen — sonst bleibt der Frame kostenlos.
  useEffect(() => {
    if (!hasCanvas) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let raf = 0;

    function cssVar(name: string) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function toScreen(x: number, y: number) {
      const view = viewRef.current;
      return {
        x: canvas!.clientWidth / 2 + view.panX + x * view.k,
        y: canvas!.clientHeight / 2 + view.panY + y * view.k,
      };
    }

    function draw() {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const view = viewRef.current;
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;

      const ink = cssVar("--ink-soft");
      const muted = cssVar("--muted");
      const lineStrong = cssVar("--line-strong");
      const red = cssVar("--red");
      const halo = cssVar("--paper-soft");

      context!.clearRect(0, 0, width, height);

      const hovered = hoverRef.current;
      const neighborIds = new Set<number>();
      if (hovered >= 0) {
        neighborIds.add(hovered);
        for (const link of links) {
          if (link.a === hovered) neighborIds.add(link.b);
          if (link.b === hovered) neighborIds.add(link.a);
        }
      }

      // Kanten.
      for (const link of links) {
        const a = toScreen(nodes[link.a].x, nodes[link.a].y);
        const b = toScreen(nodes[link.b].x, nodes[link.b].y);
        const touchesHover = hovered >= 0 && (link.a === hovered || link.b === hovered);

        context!.beginPath();
        context!.moveTo(a.x, a.y);
        context!.lineTo(b.x, b.y);
        context!.strokeStyle = touchesHover ? red : lineStrong;
        context!.globalAlpha = touchesHover ? 0.8 : hovered >= 0 ? 0.12 : 0.45;
        context!.lineWidth = touchesHover ? 1.6 : 1;
        context!.stroke();
      }

      // Knoten: erst Tags (kleiner, unauffälliger), dann Notizen.
      const order = [...nodes.keys()].sort((left, right) => {
        const rank = (index: number) => (nodes[index].kind === "tag" ? 0 : 1);
        return rank(left) - rank(right);
      });

      for (const index of order) {
        const node = nodes[index];
        const { x, y } = toScreen(node.x, node.y);
        const radius = Math.max(2, node.radius * view.k);
        const isDimmed = hovered >= 0 && !neighborIds.has(index);

        context!.globalAlpha = isDimmed ? 0.18 : 1;
        context!.beginPath();
        context!.arc(x, y, radius, 0, Math.PI * 2);

        if (node.kind === "tag") {
          context!.fillStyle = halo;
          context!.fill();
          context!.strokeStyle = muted;
          context!.lineWidth = 1.2;
          context!.stroke();
        } else {
          context!.fillStyle = node.color ?? muted;
          context!.fill();
          const tint = node.color ? withAlpha(node.color, 0.25) : null;
          if (tint && view.k > 0.5 && !isDimmed) {
            // Weicher Farbhof, passend zu den getönten Aufgabenzeilen.
            context!.beginPath();
            context!.arc(x, y, radius + 4 * view.k, 0, Math.PI * 2);
            context!.strokeStyle = tint;
            context!.lineWidth = 3 * view.k;
            context!.stroke();
          }
        }

        if (index === hovered) {
          context!.beginPath();
          context!.arc(x, y, radius + 3.5, 0, Math.PI * 2);
          context!.strokeStyle = red;
          context!.lineWidth = 2;
          context!.stroke();
        }
      }

      // Beschriftungen: beim Hineinzoomen alle, sonst nur die Hover-Umgebung.
      const zoomLabelAlpha = Math.min(1, Math.max(0, (view.k - 0.7) / 0.35));
      context!.textAlign = "center";
      context!.textBaseline = "top";

      for (const index of order) {
        const node = nodes[index];
        const isFocus = hovered >= 0 && neighborIds.has(index);
        const base = node.kind === "tag" ? zoomLabelAlpha * 0.8 : zoomLabelAlpha;
        const alpha = isFocus ? 1 : hovered >= 0 ? base * 0.15 : base;
        if (alpha < 0.05) continue;

        const { x, y } = toScreen(node.x, node.y);
        const label =
          node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;

        context!.font =
          node.kind === "tag"
            ? "10px Inter, ui-sans-serif, sans-serif"
            : "11px Inter, ui-sans-serif, sans-serif";
        context!.globalAlpha = alpha;
        context!.lineWidth = 3;
        context!.strokeStyle = halo;
        context!.strokeText(label, x, y + node.radius * view.k + 5);
        context!.fillStyle = node.kind === "tag" ? muted : ink;
        context!.fillText(label, x, y + node.radius * view.k + 5);
      }

      context!.globalAlpha = 1;
    }

    function zoomToFit() {
      const nodes = nodesRef.current;
      if (!nodes.length) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of nodes) {
        minX = Math.min(minX, node.x - node.radius);
        minY = Math.min(minY, node.y - node.radius);
        maxX = Math.max(maxX, node.x + node.radius);
        maxY = Math.max(maxY, node.y + node.radius);
      }

      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      const spanX = Math.max(maxX - minX, 60);
      const spanY = Math.max(maxY - minY, 60);
      const k = Math.min(
        2.2,
        Math.max(MIN_ZOOM, Math.min((width * 0.82) / spanX, (height * 0.82) / spanY)),
      );

      viewRef.current = {
        k,
        panX: (-(minX + maxX) / 2) * k,
        panY: (-(minY + maxY) / 2) * k,
      };
      needsDrawRef.current = true;
    }

    // Für Header-Button und Doppelklick verfügbar machen.
    fitRef.current = zoomToFit;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      canvas!.width = Math.max(1, Math.round(container!.clientWidth * ratio));
      canvas!.height = Math.max(1, Math.round(container!.clientHeight * ratio));
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      needsDrawRef.current = true;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // Theme-Wechsel ändert die CSS-Variablen → neu zeichnen.
    const themeObserver = new MutationObserver(() => {
      needsDrawRef.current = true;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    function tick() {
      raf = requestAnimationFrame(tick);
      const dragging = dragRef.current?.kind === "node";

      if (alphaRef.current > 0.02) {
        simulationStep(nodesRef.current, linksRef.current, alphaRef.current);
        alphaRef.current = Math.max(alphaRef.current * 0.975, dragging ? 0.25 : 0);
        needsDrawRef.current = true;

        if (!fitDoneRef.current && alphaRef.current < 0.5) {
          zoomToFit();
          fitDoneRef.current = true;
        }
      }

      if (needsDrawRef.current) {
        needsDrawRef.current = false;
        draw();
      }
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [hasCanvas]);

  // ── Pointer-Interaktion (Pan, Zoom, Pinch, Drag, Hover, Klick) ──────
  function localPoint(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function toWorld(point: { x: number; y: number }) {
    const canvas = canvasRef.current!;
    const view = viewRef.current;
    return {
      x: (point.x - canvas.clientWidth / 2 - view.panX) / view.k,
      y: (point.y - canvas.clientHeight / 2 - view.panY) / view.k,
    };
  }

  function hitTest(point: { x: number; y: number }): number {
    const world = toWorld(point);
    const view = viewRef.current;
    const nodes = nodesRef.current;
    // Notizen liegen über den Tag-Knoten, daher zuerst prüfen.
    for (const kind of ["note", "tag"] as const) {
      for (let index = nodes.length - 1; index >= 0; index--) {
        const node = nodes[index];
        if (node.kind !== kind) continue;
        const hitRadius = node.radius + 6 / view.k;
        const dx = world.x - node.x;
        const dy = world.y - node.y;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) return index;
      }
    }
    return -1;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 2) {
      // Pinch beginnt: laufendes Draggen/Pannen beenden.
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      releaseDraggedNode();
      dragRef.current = null;
      return;
    }

    const hit = hitTest(point);
    if (hit >= 0) {
      const world = toWorld(point);
      nodesRef.current[hit].fx = world.x;
      nodesRef.current[hit].fy = world.y;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      dragRef.current = { kind: "node", index: hit, moved: false, startX: point.x, startY: point.y };
    } else {
      const view = viewRef.current;
      dragRef.current = {
        kind: "pan",
        moved: false,
        startX: point.x,
        startY: point.y,
        panX: view.panX,
        panY: view.panY,
      };
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = localPoint(event);

    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, point);
    }

    // Pinch-Zoom um den Mittelpunkt der beiden Finger.
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchRef.current.dist > 0) {
        zoomAt(mid, dist / pinchRef.current.dist);
      }
      pinchRef.current = { dist };
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const movedFar =
        Math.abs(point.x - drag.startX) > 5 || Math.abs(point.y - drag.startY) > 5;
      if (movedFar) drag.moved = true;

      if (drag.kind === "node") {
        const world = toWorld(point);
        const node = nodesRef.current[drag.index];
        node.fx = world.x;
        node.fy = world.y;
        alphaRef.current = Math.max(alphaRef.current, 0.25);
      } else {
        viewRef.current.panX = drag.panX + (point.x - drag.startX);
        viewRef.current.panY = drag.panY + (point.y - drag.startY);
      }
      needsDrawRef.current = true;
      return;
    }

    const hit = hitTest(point);
    if (hit !== hoverRef.current) {
      hoverRef.current = hit;
      needsDrawRef.current = true;
    }
    canvasRef.current!.style.cursor =
      hit >= 0 ? (nodesRef.current[hit].kind === "note" ? "pointer" : "grab") : "grab";
  }

  function releaseDraggedNode() {
    const drag = dragRef.current;
    if (drag?.kind === "node") {
      const node = nodesRef.current[drag.index];
      node.fx = null;
      node.fy = null;
      alphaRef.current = Math.max(alphaRef.current, 0.2);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (drag?.kind === "node" && !drag.moved) {
      const node = nodesRef.current[drag.index];
      if (node.kind === "note") {
        releaseDraggedNode();
        dragRef.current = null;
        onOpenNote(node.refId);
        return;
      }
    }

    releaseDraggedNode();
    dragRef.current = null;
    needsDrawRef.current = true;
  }

  function zoomAt(point: { x: number; y: number }, factor: number) {
    const canvas = canvasRef.current!;
    const view = viewRef.current;
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
    const applied = k / view.k;
    // Der Punkt unter dem Cursor bleibt beim Zoomen stehen.
    const cx = point.x - canvas.clientWidth / 2;
    const cy = point.y - canvas.clientHeight / 2;
    view.panX = cx - (cx - view.panX) * applied;
    view.panY = cy - (cy - view.panY) * applied;
    view.k = k;
    needsDrawRef.current = true;
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    zoomAt(localPoint(event), Math.exp(-event.deltaY * 0.0012));
  }

  const noteCount = graph.nodes.filter((node) => node.kind === "note").length;

  const chipClass = (active: boolean) =>
    cx(
      "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
      active
        ? "border-[var(--green)] bg-[var(--green)] text-white"
        : "border-[var(--line-strong)] text-[var(--ink-soft)] hover:bg-[var(--surface-strong)]",
    );

  return (
    <div className="flex flex-1 flex-col px-6 pb-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("graph.title")}
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        leftLabel={t("common.back")}
        onLeft={onBack}
        rightIcon={<Maximize2 className="h-5 w-5" />}
        rightLabel={t("graph.fit")}
        onRight={() => fitRef.current()}
      />

      {notes.length === 0 ? (
        <EmptyState title={t("graph.empty.title")} text={t("graph.empty.text")} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={prefs.includeTags}
              onClick={() => updatePrefs({ includeTags: !prefs.includeTags })}
              className={chipClass(prefs.includeTags)}
            >
              {t("graph.showTags")}
            </button>
            <button
              type="button"
              aria-pressed={prefs.hideOrphans}
              onClick={() => updatePrefs({ hideOrphans: !prefs.hideOrphans })}
              className={chipClass(prefs.hideOrphans)}
            >
              {t("graph.hideOrphans")}
            </button>
            <span className="ml-auto text-[11px] text-[var(--muted)]">
              {t("graph.stats", {
                notes: noteCount,
                links: graph.links.length,
              })}
            </span>
          </div>

          {legendProjects.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {legendProjects.slice(0, 6).map((project) => (
                <span
                  key={project.id}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.title}
                </span>
              ))}
              {legendProjects.length > 6 ? (
                <span className="text-[11px] text-[var(--muted)]">
                  +{legendProjects.length - 6}
                </span>
              ) : null}
            </div>
          ) : null}

          <div
            ref={containerRef}
            className="relative mt-3 min-h-[420px] flex-1 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)]"
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={t("graph.aria")}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              onDoubleClick={() => fitRef.current()}
            />
          </div>

          <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
            {t("graph.hint")}
          </p>
        </>
      )}
    </div>
  );
}
