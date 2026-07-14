"use client";

import {
  ArrowLeft,
  Loader2,
  Maximize2,
  Search,
  Settings2,
  Sparkles,
  Telescope,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-helpers";
import { EmptyState, ScreenHeader } from "@/components/ui/primitives";
import type { GraphInsightNode, GraphInsights } from "@/lib/ai-server";
import {
  buildNoteGraph,
  initSimNodes,
  resolveLinks,
  simulationStep,
  type SimLink,
  type SimNode,
} from "@/lib/graph";
import type { MessageKey, Translator } from "@/lib/i18n";
import { withAlpha } from "@/lib/project-colors";
import type { DeepGraphInsights, Note, Project } from "@/lib/types";

const PREFS_KEY = "rote-agenda-graph";
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

type LabelMode = "off" | "auto" | "always";

type GraphPrefs = {
  includeTags: boolean;
  hideOrphans: boolean;
  nodeScale: number;
  restScale: number;
  labelMode: LabelMode;
  halo: boolean;
};

const DEFAULT_PREFS: GraphPrefs = {
  includeTags: true,
  hideOrphans: false,
  nodeScale: 1,
  restScale: 1,
  labelMode: "auto",
  halo: true,
};

const DISTANCE_OPTIONS: Array<{ value: number; labelKey: MessageKey }> = [
  { value: 0.75, labelKey: "graph.settings.distance.compact" },
  { value: 1, labelKey: "graph.settings.distance.normal" },
  { value: 1.35, labelKey: "graph.settings.distance.wide" },
];

const LABEL_MODE_KEYS: Record<LabelMode, MessageKey> = {
  off: "graph.settings.labels.off",
  auto: "graph.settings.labels.auto",
  always: "graph.settings.labels.always",
};

export type GraphAnalysisPayload = {
  nodes: GraphInsightNode[];
  edges: Array<[number, number]>;
};

// Nur clientseitig gerendert (hinter dem Auth-Check), daher ist der
// localStorage-Initializer hydration-sicher.
function readPrefs(): GraphPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<GraphPrefs>) : {};
    return {
      includeTags: parsed.includeTags !== false,
      hideOrphans: parsed.hideOrphans === true,
      nodeScale:
        typeof parsed.nodeScale === "number" && parsed.nodeScale >= 0.5 && parsed.nodeScale <= 2
          ? parsed.nodeScale
          : 1,
      restScale:
        typeof parsed.restScale === "number" && parsed.restScale >= 0.5 && parsed.restScale <= 2
          ? parsed.restScale
          : 1,
      labelMode:
        parsed.labelMode === "off" || parsed.labelMode === "always" ? parsed.labelMode : "auto",
      halo: parsed.halo !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

type View = { panX: number; panY: number; k: number };
type DragState =
  | { kind: "node"; index: number; moved: boolean; startX: number; startY: number }
  | { kind: "pan"; moved: boolean; startX: number; startY: number; panX: number; panY: number };

type Selection = {
  kind: "note" | "tag";
  id: string;
  refId: string;
  label: string;
  color: string | null;
  projectTitle: string | null;
  tags: string[];
  snippet: string;
  degree: number;
};

export function GraphScreen({
  notes,
  projects,
  insights,
  insightsError,
  isAnalyzing,
  deepInsights,
  t,
  onBack,
  onOpenNote,
  onAnalyze,
  onDismissInsights,
  onRequestDeepAnalysis,
}: {
  notes: Note[];
  projects: Project[];
  insights: GraphInsights | null;
  insightsError: string | null;
  isAnalyzing: boolean;
  deepInsights: DeepGraphInsights | null;
  t: Translator;
  onBack: () => void;
  onOpenNote: (noteId: string) => void;
  onAnalyze: (payload: GraphAnalysisPayload) => void;
  onDismissInsights: () => void;
  onRequestDeepAnalysis: () => Promise<void>;
}) {
  const [prefs, setPrefs] = useState<GraphPrefs>(() => readPrefs());
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Tiefenanalyse: angestoßen wird sie asynchron im Worker; running/ready
  // kommen als Realtime-Updates über das deepInsights-Dokument herein.
  const [isDeepStarting, setIsDeepStarting] = useState(false);
  const [deepStartError, setDeepStartError] = useState<string | null>(null);
  const [showDeep, setShowDeep] = useState(false);
  const [awaitingDeep, setAwaitingDeep] = useState(false);
  const deepStatus = deepInsights?.status ?? null;
  const isDeepRunning = isDeepStarting || deepStatus === "running";

  // Status-Wechsel während des Renders verarbeiten (React-Muster
  // "adjust state when props change" — setState im Effect ist tabu):
  // Fertigmeldung klappt das Ergebnis auf, aber nur wenn die Analyse in
  // dieser Sitzung angefordert wurde.
  const [prevDeepStatus, setPrevDeepStatus] = useState(deepStatus);
  if (deepStatus !== prevDeepStatus) {
    setPrevDeepStatus(deepStatus);
    if (deepStatus === "running") setIsDeepStarting(false);
    if (awaitingDeep && (deepStatus === "ready" || deepStatus === "error")) {
      if (deepStatus === "ready") setShowDeep(true);
      setAwaitingDeep(false);
      setIsDeepStarting(false);
    }
  }

  async function startDeepAnalysis() {
    setDeepStartError(null);
    setIsDeepStarting(true);
    setAwaitingDeep(true);
    try {
      await onRequestDeepAnalysis();
    } catch (requestError) {
      setAwaitingDeep(false);
      setIsDeepStarting(false);
      setDeepStartError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : t("graph.deep.startFailed"),
      );
    }
  }

  const graph = useMemo(
    () =>
      buildNoteGraph(notes, projects, {
        includeTags: prefs.includeTags,
        hideOrphans: prefs.hideOrphans,
        projectIds: projectFilter,
        query,
      }),
    [notes, projects, prefs.includeTags, prefs.hideOrphans, projectFilter, query],
  );

  // Projekt-Chips dienen als Legende UND Filter zugleich.
  const usedProjects = useMemo(() => {
    const used = new Set(notes.flatMap((note) => (note.projectId ? [note.projectId] : [])));
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
  // Darstellung + Auswahl müssen in der Render-Schleife aktuell sein.
  const prefsRef = useRef(prefs);
  const selectionRef = useRef<string | null>(null);

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

  useEffect(() => {
    prefsRef.current = prefs;
    needsDrawRef.current = true;
  }, [prefs]);

  // Ein anderer Kanten-Abstand braucht neue Layout-Energie.
  useEffect(() => {
    alphaRef.current = Math.max(alphaRef.current, 0.6);
  }, [prefs.restScale]);

  // Herausgefilterte Auswahl gilt als geschlossen — abgeleitet statt per
  // setState im Effekt (ESLint-Regel react-hooks/set-state-in-effect).
  const activeSelection = useMemo(
    () =>
      selection && graph.nodes.some((node) => node.id === selection.id)
        ? selection
        : null,
    [selection, graph],
  );

  useEffect(() => {
    selectionRef.current = activeSelection?.id ?? null;
    needsDrawRef.current = true;
  }, [activeSelection]);

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

    function focusIndex() {
      if (hoverRef.current >= 0) return hoverRef.current;
      const selectedId = selectionRef.current;
      if (!selectedId) return -1;
      return nodesRef.current.findIndex((node) => node.id === selectedId);
    }

    function draw() {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const view = viewRef.current;
      const settings = prefsRef.current;
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;

      const ink = cssVar("--ink-soft");
      const muted = cssVar("--muted");
      const lineStrong = cssVar("--line-strong");
      const red = cssVar("--red");
      const halo = cssVar("--paper-soft");

      context!.clearRect(0, 0, width, height);

      const focus = focusIndex();
      const neighborIds = new Set<number>();
      if (focus >= 0) {
        neighborIds.add(focus);
        for (const link of links) {
          if (link.a === focus) neighborIds.add(link.b);
          if (link.b === focus) neighborIds.add(link.a);
        }
      }

      // Kanten.
      for (const link of links) {
        const a = toScreen(nodes[link.a].x, nodes[link.a].y);
        const b = toScreen(nodes[link.b].x, nodes[link.b].y);
        const touchesFocus = focus >= 0 && (link.a === focus || link.b === focus);

        context!.beginPath();
        context!.moveTo(a.x, a.y);
        context!.lineTo(b.x, b.y);
        context!.strokeStyle = touchesFocus ? red : lineStrong;
        context!.globalAlpha = touchesFocus ? 0.8 : focus >= 0 ? 0.12 : 0.45;
        context!.lineWidth = touchesFocus ? 1.6 : 1;
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
        const radius = Math.max(2, node.radius * view.k * settings.nodeScale);
        const isDimmed = focus >= 0 && !neighborIds.has(index);

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
          if (settings.halo && tint && view.k > 0.5 && !isDimmed) {
            // Weicher Farbhof, passend zu den getönten Aufgabenzeilen.
            context!.beginPath();
            context!.arc(x, y, radius + 4 * view.k, 0, Math.PI * 2);
            context!.strokeStyle = tint;
            context!.lineWidth = 3 * view.k;
            context!.stroke();
          }
        }

        if (index === focus) {
          context!.beginPath();
          context!.arc(x, y, radius + 3.5, 0, Math.PI * 2);
          context!.strokeStyle = red;
          context!.lineWidth = 2;
          context!.stroke();
        }
      }

      // Beschriftungen je nach Einstellung: aus, zoomabhängig oder immer.
      const zoomLabelAlpha =
        settings.labelMode === "always"
          ? 1
          : settings.labelMode === "off"
            ? 0
            : Math.min(1, Math.max(0, (view.k - 0.7) / 0.35));
      context!.textAlign = "center";
      context!.textBaseline = "top";

      for (const index of order) {
        const node = nodes[index];
        const isFocus = focus >= 0 && neighborIds.has(index);
        const base = node.kind === "tag" ? zoomLabelAlpha * 0.8 : zoomLabelAlpha;
        const alpha = isFocus ? 1 : focus >= 0 ? base * 0.15 : base;
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
        context!.strokeText(label, x, y + node.radius * view.k * settings.nodeScale + 5);
        context!.fillStyle = node.kind === "tag" ? muted : ink;
        context!.fillText(label, x, y + node.radius * view.k * settings.nodeScale + 5);
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

    fitRef.current = zoomToFit;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const wasDegenerate = canvas!.width <= 2 || canvas!.height <= 2;
      canvas!.width = Math.max(1, Math.round(container!.clientWidth * ratio));
      canvas!.height = Math.max(1, Math.round(container!.clientHeight * ratio));
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      needsDrawRef.current = true;

      // Nach einem 0-Breite-Zustand (eingeklapptes Fenster, App-Switcher)
      // zeigt die gemerkte Kamera ins Leere — Ansicht neu einpassen.
      if (wasDegenerate && canvas!.width > 2 && canvas!.height > 2) {
        zoomToFit();
      }
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

      // Selbstheilung: Nach Screen-Wechseln verpasst der ResizeObserver
      // gelegentlich das erste Layout — dann wäre der Canvas 1 px breit.
      const ratio = window.devicePixelRatio || 1;
      if (
        canvas!.width !== Math.max(1, Math.round(container!.clientWidth * ratio)) ||
        canvas!.height !== Math.max(1, Math.round(container!.clientHeight * ratio))
      ) {
        resize();
      }

      const dragging = dragRef.current?.kind === "node";

      if (alphaRef.current > 0.02) {
        simulationStep(nodesRef.current, linksRef.current, alphaRef.current, {
          restScale: prefsRef.current.restScale,
        });
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

  // ── Pointer-Interaktion (Pan, Zoom, Pinch, Drag, Hover, Auswahl) ────
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
    const nodeScale = prefsRef.current.nodeScale;
    // Notizen liegen über den Tag-Knoten, daher zuerst prüfen.
    for (const kind of ["note", "tag"] as const) {
      for (let index = nodes.length - 1; index >= 0; index--) {
        const node = nodes[index];
        if (node.kind !== kind) continue;
        const hitRadius = node.radius * nodeScale + 6 / view.k;
        const dx = world.x - node.x;
        const dy = world.y - node.y;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) return index;
      }
    }
    return -1;
  }

  // Auswahl-Panel statt Direktnavigation: erst Infos zeigen, Öffnen ist
  // ein bewusster zweiter Klick.
  function selectNode(index: number) {
    const node = nodesRef.current[index];
    if (node.kind === "tag") {
      setSelection({
        kind: "tag",
        id: node.id,
        refId: node.refId,
        label: node.label,
        color: null,
        projectTitle: null,
        tags: [],
        snippet: "",
        degree: node.degree,
      });
      return;
    }

    const note = notes.find((entry) => entry.id === node.refId);
    const project = note?.projectId
      ? projects.find((entry) => entry.id === note.projectId)
      : undefined;
    setSelection({
      kind: "note",
      id: node.id,
      refId: node.refId,
      label: node.label,
      color: node.color,
      projectTitle: project?.title ?? null,
      tags: note?.tags ?? [],
      snippet: (note ? note.enhanced || note.content : "").slice(0, 180),
      degree: node.degree,
    });
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
    canvasRef.current!.style.cursor = hit >= 0 ? "pointer" : "grab";
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

    if (drag && !drag.moved) {
      if (drag.kind === "node") {
        selectNode(drag.index);
      } else {
        setSelection(null);
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

  // ── KI-Analyse: kompaktes Abbild des gefilterten Netzes ─────────────
  function startAnalysis() {
    const noteNodes = graph.nodes.filter((node) => node.kind === "note");
    const indexByNode = new Map(noteNodes.map((node, index) => [node.id, index]));
    const noteById = new Map(notes.map((note) => [note.id, note]));
    const projectById = new Map(projects.map((project) => [project.id, project]));

    const payloadNodes: GraphInsightNode[] = noteNodes.map((node) => {
      const note = noteById.get(node.refId);
      const project = note?.projectId ? projectById.get(note.projectId) : undefined;
      return {
        title: node.label,
        tags: note?.tags ?? [],
        project: project?.title ?? null,
        degree: node.degree,
      };
    });

    const edges: Array<[number, number]> = graph.links.flatMap((link) => {
      if (link.kind !== "related") return [];
      const a = indexByNode.get(link.source);
      const b = indexByNode.get(link.target);
      return a === undefined || b === undefined ? [] : [[a, b] as [number, number]];
    });

    onAnalyze({ nodes: payloadNodes, edges });
  }

  function toggleProject(projectId: string) {
    setProjectFilter((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  const noteCount = graph.nodes.filter((node) => node.kind === "note").length;

  const chipClass = (active: boolean) =>
    cx(
      "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
      active
        ? "border-[var(--green)] bg-[var(--green)] text-white"
        : "border-[var(--line-strong)] text-[var(--ink-soft)] hover:bg-[var(--surface-strong)]",
    );

  const settingChip = (active: boolean) =>
    cx(
      "rounded-[5px] border px-2.5 py-1.5 text-[11px] font-semibold",
      active
        ? "border-[var(--green)] bg-[var(--green)] text-white"
        : "border-[var(--line-strong)] text-[var(--ink-soft)]",
    );

  // Das Panel zeigt entweder die flüchtige Kompakt-Analyse oder die
  // gespeicherte Tiefenanalyse — beide teilen sich die Struktur.
  const deepReady = deepInsights?.status === "ready" && Boolean(deepInsights.summary);
  const activeInsights: GraphInsights | null =
    showDeep && deepReady && deepInsights ? deepInsights : insights;

  const insightSections: Array<{ key: string; title: string; items: string[] }> =
    activeInsights
      ? [
          {
            key: "clusters",
            title: t("graph.insights.clusters"),
            items: activeInsights.clusters,
          },
          {
            key: "anomalies",
            title: t("graph.insights.anomalies"),
            items: activeInsights.anomalies,
          },
          { key: "gaps", title: t("graph.insights.gaps"), items: activeInsights.gaps },
          {
            key: "suggestions",
            title: t("graph.insights.suggestions"),
            items: activeInsights.suggestions,
          },
        ].filter((section) => section.items.length)
      : [];

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
          <div className="mt-4 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("graph.searchPlaceholder")}
                className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--muted)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("common.close")}
                  className="grid h-6 w-6 shrink-0 place-items-center text-[var(--muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-label={t("graph.settings")}
                aria-expanded={settingsOpen}
                className={cx(
                  "grid h-9 w-9 place-items-center rounded-[5px] border",
                  settingsOpen
                    ? "border-[var(--green)] bg-[var(--green)] text-white"
                    : "border-[var(--line-strong)] text-[var(--ink)]",
                )}
              >
                <Settings2 className="h-4 w-4" />
              </button>
              {settingsOpen ? (
                <div className="absolute right-0 top-11 z-40 w-64 rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-4 shadow-xl">
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
                    {t("graph.settings")}
                  </p>
                  <label className="mt-3 block text-[12px] font-semibold">
                    {t("graph.settings.nodeSize")}
                    <input
                      type="range"
                      min={60}
                      max={160}
                      step={10}
                      value={Math.round(prefs.nodeScale * 100)}
                      onChange={(event) =>
                        updatePrefs({ nodeScale: Number(event.target.value) / 100 })
                      }
                      className="mt-1 w-full accent-[var(--red)]"
                    />
                  </label>
                  <p className="mt-3 text-[12px] font-semibold">{t("graph.settings.distance")}</p>
                  <div className="mt-1 flex gap-1.5">
                    {DISTANCE_OPTIONS.map((option) => (
                      <button
                        key={option.labelKey}
                        type="button"
                        onClick={() => updatePrefs({ restScale: option.value })}
                        className={settingChip(Math.abs(prefs.restScale - option.value) < 0.01)}
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] font-semibold">{t("graph.settings.labels")}</p>
                  <div className="mt-1 flex gap-1.5">
                    {(["off", "auto", "always"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updatePrefs({ labelMode: mode })}
                        className={settingChip(prefs.labelMode === mode)}
                      >
                        {t(LABEL_MODE_KEYS[mode])}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePrefs({ halo: !prefs.halo })}
                    aria-pressed={prefs.halo}
                    className={cx("mt-3", settingChip(prefs.halo))}
                  >
                    {t("graph.settings.halo")}
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={startAnalysis}
              disabled={isAnalyzing || noteCount < 3}
              title={noteCount < 3 ? t("graph.insights.tooFew") : undefined}
              className="flex h-9 shrink-0 items-center gap-2 rounded-[5px] bg-[var(--red)] px-3 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isAnalyzing ? t("graph.analyzing") : t("graph.analyze")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void startDeepAnalysis()}
              disabled={isDeepRunning || noteCount < 3}
              title={noteCount < 3 ? t("graph.insights.tooFew") : t("graph.deep.hint")}
              className="flex h-9 shrink-0 items-center gap-2 rounded-[5px] border border-[var(--line-strong)] px-3 text-[12px] font-bold disabled:opacity-50"
            >
              {isDeepRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Telescope className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isDeepRunning ? t("graph.deep.running.short") : t("graph.deep.button")}
              </span>
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
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
            {usedProjects.map((project) => {
              const active = projectFilter.includes(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleProject(project.id)}
                  className={cx(chipClass(active), "flex items-center gap-1.5")}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.title}
                </button>
              );
            })}
            <span className="ml-auto text-[11px] text-[var(--muted)]">
              {t("graph.stats", { notes: noteCount, links: graph.links.length })}
            </span>
          </div>

          {insightsError ? (
            <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--red)]">
              {insightsError}
            </p>
          ) : null}
          {deepStartError ? (
            <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--red)]">
              {deepStartError}
            </p>
          ) : null}
          {deepStatus === "error" && deepInsights?.error ? (
            <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--red)]">
              {t("graph.deep.failed", { detail: deepInsights.error })}
            </p>
          ) : null}
          {isDeepRunning ? (
            <p className="mt-2 flex items-center gap-2 rounded-[5px] border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 text-[12px] leading-5 text-[var(--ink-soft)]">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              {t("graph.deep.running")}
            </p>
          ) : null}
          {deepReady && !showDeep && !isDeepRunning ? (
            <button
              type="button"
              onClick={() => setShowDeep(true)}
              className="mt-2 flex items-center gap-2 rounded-[5px] border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 text-left text-[12px] font-bold leading-5 text-[var(--ink-soft)]"
            >
              <Telescope className="h-3.5 w-3.5 shrink-0 text-[var(--red)]" />
              {t("graph.deep.view", {
                date: (deepInsights?.updatedAt ?? "").slice(0, 16).replace("T", ", "),
                count: deepInsights?.noteCount ?? 0,
              })}
            </button>
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

            {noteCount === 0 ? (
              <p className="pointer-events-none absolute inset-x-6 top-6 text-center text-[13px] text-[var(--muted)]">
                {t("graph.noMatches")}
              </p>
            ) : null}

            {activeSelection ? (
              <div className="absolute bottom-3 left-3 z-30 w-[min(320px,calc(100%-24px))] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-4 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-bold leading-5">
                      {activeSelection.kind === "note" && activeSelection.color ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: activeSelection.color }}
                        />
                      ) : null}
                      <span className="truncate">{activeSelection.label}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {activeSelection.kind === "note"
                        ? [
                            activeSelection.projectTitle ?? t("task.noProject"),
                            t("graph.selected.links", { count: activeSelection.degree }),
                          ].join(" · ")
                        : t("graph.selected.links", { count: activeSelection.degree })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelection(null)}
                    aria-label={t("common.close")}
                    className="grid h-7 w-7 shrink-0 place-items-center text-[var(--muted)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {activeSelection.kind === "note" ? (
                  <>
                    {activeSelection.snippet ? (
                      <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[var(--ink-soft)]">
                        {activeSelection.snippet}
                      </p>
                    ) : null}
                    {activeSelection.tags.length ? (
                      <p className="mt-2 truncate text-[11px] text-[var(--muted)]">
                        {activeSelection.tags.map((tag) => `#${tag}`).join(" ")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpenNote(activeSelection.refId)}
                      className="mt-3 w-full rounded-[5px] bg-[var(--red)] px-3 py-2 text-[12px] font-bold text-white"
                    >
                      {t("graph.openNote")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(`#${activeSelection.refId}`);
                      setSelection(null);
                    }}
                    className="mt-3 w-full rounded-[5px] bg-[var(--green)] px-3 py-2 text-[12px] font-bold text-white"
                  >
                    {t("graph.filterTag")}
                  </button>
                )}
              </div>
            ) : null}

            {activeInsights ? (
              <div
                className={cx(
                  "absolute inset-y-3 right-3 z-20 overflow-y-auto rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-4 shadow-xl",
                  showDeep && deepReady
                    ? "w-[min(400px,calc(100%-24px))]"
                    : "w-[min(320px,calc(100%-24px))]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-[13px] font-bold">
                    {showDeep && deepReady ? (
                      <Telescope className="h-4 w-4 text-[var(--red)]" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-[var(--red)]" />
                    )}
                    {showDeep && deepReady
                      ? t("graph.deep.title")
                      : t("graph.insights.title")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (showDeep) {
                        setShowDeep(false);
                      } else {
                        onDismissInsights();
                      }
                    }}
                    aria-label={t("common.close")}
                    className="grid h-7 w-7 shrink-0 place-items-center text-[var(--muted)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {showDeep && deepReady && deepInsights ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {t("graph.deep.meta", {
                      date: deepInsights.updatedAt.slice(0, 16).replace("T", ", "),
                      count: deepInsights.noteCount,
                    })}
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-[var(--ink-soft)]">
                  {activeInsights.summary}
                </p>
                {insightSections.map((section) => (
                  <div key={section.key} className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
                      {section.title}
                    </p>
                    <ul className="mt-1 space-y-1.5">
                      {section.items.map((item, index) => (
                        <li
                          key={index}
                          className="border-l-2 border-[var(--line-strong)] pl-2 text-[12px] leading-5 text-[var(--ink-soft)]"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
            {t("graph.hint")}
          </p>
        </>
      )}
    </div>
  );
}
