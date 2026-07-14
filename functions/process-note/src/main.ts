// Notiz-Worker: verarbeitet Link- und Foto-Notizen asynchron, damit die
// 30-Sekunden-Grenze der Appwrite-Site keine Rolle mehr spielt.
//
// Trigger: Datenbank-Event "documents.*.create" auf der Notiz-Collection.
// Ablauf: Inhalt beschaffen (Webseite/YouTube zusammenfassen bzw. Foto-OCR)
// → normale KI-Veredelung (Titel, Tags, Projekt, Verlinkung, Vorschläge)
// → Notiz aktualisieren; die App-UI zieht per Realtime automatisch nach.
//
// Wird per esbuild gebündelt (npm run build:worker im Repo-Root) und teilt
// sich die KI-/Web-Logik mit der App aus src/lib/.

import { Client, Databases, ID, Storage, Users, Query } from "node-appwrite";
import {
  categorizeNotesWithProvider,
  enhanceNoteWithProvider,
  extractImageText,
  generateGraphInsights,
  MAX_INSIGHT_NODES,
  resolveAiModelConfig,
  summarizeWebText,
  summarizeYouTubeVideo,
  type GraphInsightNode,
} from "../../../src/lib/ai-server.ts";
import { DEFAULT_AI_MODEL_ID, isAiModelId } from "../../../src/lib/ai-models.ts";
import {
  extractHtmlTitle,
  fetchPublicPage,
  fetchYouTubeOEmbed,
  htmlToText,
  parseYouTubeVideoId,
} from "../../../src/lib/web-content.ts";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "roteagenda";
const NOTES_ID = process.env.APPWRITE_RAW_NOTES_COLLECTION_ID || "rawNotes";
const SUGGESTIONS_ID = process.env.APPWRITE_SUGGESTIONS_COLLECTION_ID || "suggestions";
const PROJECTS_ID = process.env.APPWRITE_PROJECTS_COLLECTION_ID || "projects";
const TASKS_ID = process.env.APPWRITE_TASKS_COLLECTION_ID || "tasks";
const INSIGHTS_ID = process.env.APPWRITE_GRAPH_INSIGHTS_COLLECTION_ID || "graphInsights";
const BUCKET_ID = process.env.APPWRITE_MEDIA_BUCKET_ID || "noteMedia";

type Context = {
  req: { body?: unknown; bodyJson?: unknown; headers: Record<string, string> };
  res: { json: (data: unknown, status?: number) => unknown };
  log: (message: string) => void;
  error: (message: string) => void;
};

export default async ({ req, res, log, error }: Context) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT ?? "")
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID ?? "")
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const databases = new Databases(client);
  const storage = new Storage(client);
  const users = new Users(client);

  // Direkte Ausführung aus der App (functions.createExecution) statt
  // DB-Event: Graph-Tiefenanalyse oder Batch-Kategorisierung.
  if ((req.headers["x-appwrite-trigger"] ?? "") === "http") {
    const payload = readDocument(req);
    if (payload?.type === "categorize-notes") {
      return runNoteCategorization({ req, res, log, error }, databases, users);
    }
    return runDeepGraphInsights({ req, res, log, error }, databases, users);
  }

  const doc = readDocument(req);
  if (!doc || typeof doc.$id !== "string") {
    return res.json({ skipped: "kein Dokument im Event" });
  }

  // Der Trigger lauscht auf ALLE Dokument-Events der Collection (der
  // Event-Validator kennt die .upsert-Events der App nicht einzeln).
  // Deshalb hier aussortieren, bevor Kosten entstehen:
  // Gelöschte Notizen nur noch von verwaisten Upload-Dateien befreien.
  const eventName = req.headers["x-appwrite-event"] ?? "";
  if (eventName.endsWith(".delete")) {
    await cleanupFile(storage, doc);
    return res.json({ skipped: "delete-event" });
  }
  if (doc.processed === true) {
    return res.json({ skipped: "bereits verarbeitet" });
  }
  if (typeof doc.processingError === "string" && doc.processingError) {
    // Der Fehlerstatus stammt vom Worker selbst — nie erneut anlaufen,
    // sonst entsteht über das eigene Update-Event eine Endlosschleife.
    return res.json({ skipped: "bereits fehlgeschlagen" });
  }
  const source = doc.source;
  if (source !== "url" && source !== "image") {
    // Manuelle/Capture-Notizen veredelt die App synchron selbst.
    return res.json({ skipped: `source=${String(source)}` });
  }
  if (
    typeof doc.createdAt === "string" &&
    typeof doc.updatedAt === "string" &&
    doc.updatedAt !== doc.createdAt
  ) {
    // Frische Importe tragen updatedAt === createdAt; spätere Updates
    // (z. B. Pinnen während der Analyse) sind Echos und keine neuen Aufträge.
    return res.json({ skipped: "bereits angefasst" });
  }

  const noteId = doc.$id as string;
  const now = () => new Date().toISOString();

  try {
    const userId = extractUserId(doc.$permissions as string[] | undefined);
    const prefs = userId
      ? await users.getPrefs(userId).catch(() => ({} as Record<string, unknown>))
      : ({} as Record<string, unknown>);
    const aiModel =
      typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel)
        ? prefs.aiModel
        : DEFAULT_AI_MODEL_ID;
    const locale = prefs.locale === "en" ? ("en" as const) : ("de" as const);

    // ── Phase 1: Inhalt beschaffen ─────────────────────────────────
    let content = "";
    let sourceTitle = "";

    if (source === "url") {
      const sourceUrl = String(doc.sourceUrl ?? "");
      if (!sourceUrl) throw new Error("Zur Link-Notiz fehlt die URL.");
      log(`Analysiere URL: ${sourceUrl}`);
      const result = await buildUrlContent(sourceUrl, aiModel, locale);
      content = result.content;
      sourceTitle = result.title;
    } else {
      const fileId = typeof doc.pendingFileId === "string" ? doc.pendingFileId : "";
      if (!fileId) throw new Error("Zur Foto-Notiz fehlt die hochgeladene Datei.");
      log(`Lese Foto ${fileId}`);
      const bytes = await storage.getFileDownload(BUCKET_ID, fileId);
      const imageBase64 = Buffer.from(bytes as ArrayBuffer).toString("base64");
      content = await extractImageText({ imageBase64, locale, timeoutMs: OCR_TIMEOUT_MS });
    }

    // ── Phase 2: normale Veredelung mit Nutzer-Kontext ─────────────
    const resolved = resolveAiModelConfig(aiModel);
    if (!resolved.ok) {
      // Inhalt sichern; Veredelung kann der Nutzer später manuell anstoßen.
      await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
        content: content.slice(0, 8000),
        title: sourceTitle.slice(0, 250),
        pendingFileId: null,
        processingError: resolved.error.slice(0, 1000),
        updatedAt: now(),
      });
      return res.json({ ok: false, stored: true, reason: "kein KI-Key" });
    }

    const marker = userId ? `user:${userId}` : null;
    const [projects, tasks, notes] = await Promise.all([
      listUserDocuments(databases, PROJECTS_ID, marker),
      listUserDocuments(databases, TASKS_ID, marker),
      listUserDocuments(databases, NOTES_ID, marker),
    ]);

    const enhancementResult = await enhanceNoteWithProvider({
      config: resolved.config,
      noteId: String(doc.id ?? noteId),
      timeoutMs: ENHANCE_TIMEOUT_MS,
      content,
      projects: projects.map((project) => ({
        id: String(project.id ?? project.$id),
        title: String(project.title ?? ""),
        description: String(project.description ?? ""),
        keywords: Array.isArray(project.keywords) ? (project.keywords as string[]) : [],
        aiEnabled: project.aiEnabled !== false,
      })),
      openTasks: tasks
        .filter((task) => task.status !== "done")
        .slice(0, 150)
        .map((task) => ({
          title: String(task.title ?? ""),
          projectId: typeof task.projectId === "string" ? task.projectId : null,
          dueDate: typeof task.dueDate === "string" ? task.dueDate : null,
        })),
      existingTags: Array.from(
        new Set(notes.flatMap((note) => (Array.isArray(note.tags) ? note.tags : []))),
      ).slice(0, 120) as string[],
      // Alle Notizen als Verlinkungs-Kandidaten (bis zur Prompt-Grenze),
      // mit Inhalts-Snippet — identisch zur App-seitigen Veredelung.
      otherNotes: notes
        .filter((note) => note.$id !== noteId)
        .slice(0, 250)
        .map((note) => ({
          id: String(note.id ?? note.$id),
          title: String(note.title || String(note.content ?? "").slice(0, 60)),
          tags: Array.isArray(note.tags) ? (note.tags as string[]) : [],
          snippet: String(note.enhanced || note.content || "").slice(0, 200),
        })),
      locale,
    });

    const { enhancement, suggestions } = enhancementResult;

    // Vorschläge zuerst: Sobald die Notiz processed ist, läuft der Worker
    // für sie nie wieder — ein danach gescheiterter Vorschlag wäre still
    // und endgültig verloren.
    let failedSuggestions = 0;
    for (const suggestion of suggestions) {
      try {
        await databases.createDocument(
          DATABASE_ID,
          SUGGESTIONS_ID,
          suggestion.id,
          toDocumentData(suggestion),
          (doc.$permissions as string[]) ?? [],
        );
      } catch (suggestionError) {
        failedSuggestions += 1;
        error(`Vorschlag konnte nicht gespeichert werden: ${String(suggestionError)}`);
      }
    }

    const suggestionWarning =
      failedSuggestions === 0
        ? null
        : locale === "en"
          ? `${failedSuggestions} of ${suggestions.length} suggestions could not be saved.`
          : `${failedSuggestions} von ${suggestions.length} Vorschlägen konnten nicht gespeichert werden.`;

    await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
      content: content.slice(0, 8000),
      title: (enhancement.title || sourceTitle).slice(0, 250),
      enhanced: enhancement.enhanced.slice(0, 19000),
      tags: enhancement.tags,
      projectId: enhancement.projectId ?? (doc.projectId as string | null) ?? null,
      relatedNoteIds: enhancement.relatedNoteIds,
      processed: true,
      pendingFileId: null,
      processingError: suggestionWarning,
      updatedAt: now(),
    });

    log(`Fertig: ${suggestions.length - failedSuggestions}/${suggestions.length} Vorschläge`);
    return res.json({ ok: failedSuggestions === 0, suggestions: suggestions.length });
  } catch (workerError) {
    const message =
      workerError instanceof Error && workerError.message
        ? workerError.message
        : "Unbekannter Fehler bei der Analyse.";
    error(message);

    try {
      await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
        processingError: message.slice(0, 1000),
        pendingFileId: null,
        updatedAt: now(),
      });
    } catch (updateError) {
      error(`Fehlerstatus konnte nicht gespeichert werden: ${String(updateError)}`);
    }

    // 200 zurückgeben: Der Fehler steht in der Notiz, kein Event-Retry nötig.
    // Das Foto bleibt erhalten — die Notiz zeigt es auch ohne Analyse.
    return res.json({ ok: false, error: message });
  }
};

// Ausführliche Wissensnetz-Analyse ohne 25-s-Site-Limit: baut den Graph
// aus allen Notizen des Nutzers, lässt die KI in Ruhe analysieren und
// schreibt das Ergebnis in das eine graphInsights-Dokument des Nutzers —
// die App zieht per Realtime nach.
const DEEP_INSIGHTS_TIMEOUT_MS = 240_000;

async function runDeepGraphInsights(
  { req, res, log, error }: Context,
  databases: Databases,
  users: Users,
) {
  const payload = readDocument(req);
  if (!payload || payload.type !== "deep-graph-insights") {
    return res.json({ skipped: "unbekannter Auftrag" }, 400);
  }

  const userId = String(req.headers["x-appwrite-user-id"] ?? "");
  if (!userId) {
    return res.json({ error: "Die Tiefenanalyse braucht eine Nutzer-Sitzung." }, 401);
  }

  const marker = `user:${userId}`;
  const permissions = [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`,
  ];
  const now = () => new Date().toISOString();
  let insightsDocId = "";

  try {
    const prefs = await users.getPrefs(userId).catch(() => ({}) as Record<string, unknown>);
    const aiModel =
      typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel)
        ? prefs.aiModel
        : DEFAULT_AI_MODEL_ID;
    const locale = prefs.locale === "en" ? ("en" as const) : ("de" as const);
    const resolved = resolveAiModelConfig(aiModel);
    if (!resolved.ok) {
      return res.json({ error: resolved.error }, 503);
    }

    // Genau ein Analyse-Dokument pro Nutzer: vorhandenes fortschreiben.
    const existing = (await listUserDocuments(databases, INSIGHTS_ID, marker))[0];
    if (existing) {
      insightsDocId = String(existing.$id);
      await databases.updateDocument(DATABASE_ID, INSIGHTS_ID, insightsDocId, {
        status: "running",
        error: null,
        updatedAt: now(),
      });
    } else {
      insightsDocId = ID.unique();
      await databases.createDocument(
        DATABASE_ID,
        INSIGHTS_ID,
        insightsDocId,
        {
          id: insightsDocId,
          status: "running",
          summary: "",
          createdAt: now(),
          updatedAt: now(),
        },
        permissions,
      );
    }

    log(`Tiefenanalyse für ${userId} gestartet`);
    const [projects, notes] = await Promise.all([
      listUserDocuments(databases, PROJECTS_ID, marker),
      listUserDocuments(databases, NOTES_ID, marker),
    ]);

    const graph = buildInsightGraph(notes, projects);
    const insights = await generateGraphInsights({
      config: resolved.config,
      nodes: graph.nodes,
      edges: graph.edges,
      locale,
      timeoutMs: DEEP_INSIGHTS_TIMEOUT_MS,
      detail: true,
    });

    await databases.updateDocument(DATABASE_ID, INSIGHTS_ID, insightsDocId, {
      status: "ready",
      summary: insights.summary.slice(0, 19000),
      clusters: insights.clusters.map((item) => item.slice(0, 1900)),
      anomalies: insights.anomalies.map((item) => item.slice(0, 1900)),
      gaps: insights.gaps.map((item) => item.slice(0, 1900)),
      suggestions: insights.suggestions.map((item) => item.slice(0, 1900)),
      error: null,
      noteCount: notes.length,
      updatedAt: now(),
    });

    log(`Tiefenanalyse fertig: ${notes.length} Notizen`);
    return res.json({ ok: true, notes: notes.length });
  } catch (workerError) {
    const message =
      workerError instanceof Error && workerError.message
        ? workerError.message
        : "Unbekannter Fehler bei der Tiefenanalyse.";
    error(message);

    if (insightsDocId) {
      try {
        await databases.updateDocument(DATABASE_ID, INSIGHTS_ID, insightsDocId, {
          status: "error",
          error: message.slice(0, 1000),
          updatedAt: now(),
        });
      } catch (updateError) {
        error(`Fehlerstatus konnte nicht gespeichert werden: ${String(updateError)}`);
      }
    }

    return res.json({ ok: false, error: message });
  }
}

// Batch-Kategorisierung: ordnet alle unzugeordneten, bereits
// verarbeiteten Notizen vorhandenen Projekten zu (direkte Updates, die
// App zieht per Realtime nach) und bündelt zusammengehörige Rest-
// Notizen zu Neues-Projekt-Vorschlägen in der Inbox.
const CATEGORIZE_TIMEOUT_MS = 90_000;
const CATEGORIZE_CHUNK_SIZE = 80;

async function runNoteCategorization(
  { req, res, log, error }: Context,
  databases: Databases,
  users: Users,
) {
  const userId = String(req.headers["x-appwrite-user-id"] ?? "");
  if (!userId) {
    return res.json({ error: "Die Kategorisierung braucht eine Nutzer-Sitzung." }, 401);
  }

  const marker = `user:${userId}`;
  const permissions = [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`,
  ];
  const now = () => new Date().toISOString();

  try {
    const prefs = await users.getPrefs(userId).catch(() => ({}) as Record<string, unknown>);
    const aiModel =
      typeof prefs.aiModel === "string" && isAiModelId(prefs.aiModel)
        ? prefs.aiModel
        : DEFAULT_AI_MODEL_ID;
    const locale = prefs.locale === "en" ? ("en" as const) : ("de" as const);
    const resolved = resolveAiModelConfig(aiModel);
    if (!resolved.ok) {
      return res.json({ error: resolved.error }, 503);
    }

    const [projects, notes, suggestions] = await Promise.all([
      listUserDocuments(databases, PROJECTS_ID, marker),
      listUserDocuments(databases, NOTES_ID, marker),
      listUserDocuments(databases, SUGGESTIONS_ID, marker),
    ]);

    const candidates = notes.filter(
      (note) =>
        note.processed === true &&
        !note.projectId &&
        !(typeof note.processingError === "string" && note.processingError) &&
        Boolean(note.title || note.content),
    );
    if (!candidates.length) {
      log("Kategorisierung: nichts zu tun");
      return res.json({ ok: true, assigned: 0, proposed: 0 });
    }

    const projectInputs = projects
      .filter((project) => project.aiEnabled !== false)
      .map((project) => ({
        id: String(project.id ?? project.$id),
        title: String(project.title ?? ""),
        description: String(project.description ?? ""),
        keywords: Array.isArray(project.keywords) ? (project.keywords as string[]) : [],
      }));

    // Blockweise kategorisieren; Neues-Projekt-Vorschläge über alle
    // Blöcke hinweg per Titel zusammenführen.
    const assignments: Array<{ noteId: string; projectId: string }> = [];
    const mergedProjects = new Map<
      string,
      {
        title: string;
        description: string;
        reason: string;
        noteIds: string[];
        relatedProjectIds: string[];
      }
    >();

    for (let offset = 0; offset < candidates.length; offset += CATEGORIZE_CHUNK_SIZE) {
      const chunk = candidates.slice(offset, offset + CATEGORIZE_CHUNK_SIZE);
      const result = await categorizeNotesWithProvider({
        config: resolved.config,
        notes: chunk.map((note) => ({
          id: String(note.id ?? note.$id),
          title: String(note.title || String(note.content ?? "").slice(0, 60)),
          tags: Array.isArray(note.tags) ? (note.tags as string[]) : [],
          snippet: String(note.enhanced || note.content || "").slice(0, 160),
        })),
        projects: projectInputs,
        locale,
        timeoutMs: CATEGORIZE_TIMEOUT_MS,
      });

      assignments.push(...result.assignments);
      for (const project of result.newProjects) {
        const key = project.title.toLowerCase();
        const existing = mergedProjects.get(key);
        if (existing) {
          existing.noteIds.push(...project.noteIds);
          existing.relatedProjectIds.push(...project.relatedProjectIds);
        } else {
          mergedProjects.set(key, {
            ...project,
            noteIds: [...project.noteIds],
            relatedProjectIds: [...project.relatedProjectIds],
          });
        }
      }
    }

    // Zuordnungen direkt anwenden — der Event-Guard (processed=true)
    // verhindert, dass diese Updates den Worker erneut anwerfen.
    for (const assignment of assignments) {
      try {
        await databases.updateDocument(DATABASE_ID, NOTES_ID, assignment.noteId, {
          projectId: assignment.projectId,
          updatedAt: now(),
        });
      } catch (assignError) {
        error(`Zuordnung fehlgeschlagen (${assignment.noteId}): ${String(assignError)}`);
      }
    }

    // Bereits offene Projekt-Vorschläge nicht doppeln.
    const pendingProjectTitles = new Set(
      suggestions
        .filter((item) => item.kind === "project" && item.state === "pending")
        .map((item) => String(item.suggestedTitle ?? "").toLowerCase()),
    );

    let proposed = 0;
    for (const project of mergedProjects.values()) {
      if (pendingProjectTitles.has(project.title.toLowerCase())) continue;
      const suggestionId = ID.unique();
      try {
        await databases.createDocument(
          DATABASE_ID,
          SUGGESTIONS_ID,
          suggestionId,
          {
            id: suggestionId,
            rawNoteId: project.noteIds[0],
            kind: "project",
            suggestedTitle: project.title.slice(0, 250),
            suggestedDescription: project.description.slice(0, 4000),
            suggestedNewProjectTitle: project.title.slice(0, 120),
            suggestedNoteIds: project.noteIds.slice(0, 100),
            relatedProjectIds: Array.from(new Set(project.relatedProjectIds)).slice(0, 12),
            confidence: 0.8,
            priority: "medium",
            reasoning: (project.reason || project.description).slice(0, 4000),
            needsReview: false,
            state: "pending",
            createdAt: now(),
          },
          permissions,
        );
        proposed += 1;
      } catch (suggestionError) {
        error(`Projekt-Vorschlag fehlgeschlagen: ${String(suggestionError)}`);
      }
    }

    log(`Kategorisierung: ${assignments.length} zugeordnet, ${proposed} Projekt-Vorschläge`);
    return res.json({ ok: true, assigned: assignments.length, proposed });
  } catch (workerError) {
    const message =
      workerError instanceof Error && workerError.message
        ? workerError.message
        : "Unbekannter Fehler bei der Kategorisierung.";
    error(message);
    return res.json({ ok: false, error: message });
  }
}

// Notizen als Knoten, relatedNoteIds als ungerichtete Kanten; bei mehr
// als MAX_INSIGHT_NODES gewinnen die zentralsten (statt beliebiger)
// Notizen — sortiert nach Vernetzungsgrad, dann Aktualität.
function buildInsightGraph(
  notes: Record<string, unknown>[],
  projects: Record<string, unknown>[],
): { nodes: GraphInsightNode[]; edges: Array<[number, number]> } {
  const idToIndex = new Map<string, number>();
  notes.forEach((note, index) => {
    idToIndex.set(String(note.id ?? note.$id), index);
  });

  const edgeKeys = new Set<string>();
  let edges: Array<[number, number]> = [];
  notes.forEach((note, from) => {
    const related = Array.isArray(note.relatedNoteIds) ? note.relatedNoteIds : [];
    for (const target of related) {
      const to = idToIndex.get(String(target));
      if (to === undefined || to === from) continue;
      const [a, b] = from < to ? [from, to] : [to, from];
      const key = `${a}-${b}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push([a, b]);
    }
  });

  const degrees = new Array<number>(notes.length).fill(0);
  for (const [a, b] of edges) {
    degrees[a] += 1;
    degrees[b] += 1;
  }

  const projectTitles = new Map(
    projects.map((project) => [String(project.id ?? project.$id), String(project.title ?? "")]),
  );

  let order = notes.map((_, index) => index);
  if (notes.length > MAX_INSIGHT_NODES) {
    order = [...order]
      .sort((a, b) => {
        if (degrees[b] !== degrees[a]) return degrees[b] - degrees[a];
        return String(notes[b].createdAt ?? "").localeCompare(String(notes[a].createdAt ?? ""));
      })
      .slice(0, MAX_INSIGHT_NODES);

    const remap = new Map<number, number>();
    order.forEach((oldIndex, newIndex) => remap.set(oldIndex, newIndex));
    edges = edges.flatMap(([a, b]) => {
      const na = remap.get(a);
      const nb = remap.get(b);
      return na !== undefined && nb !== undefined ? [[na, nb] as [number, number]] : [];
    });
  }

  const nodes = order.map((index) => {
    const note = notes[index];
    const projectId = typeof note.projectId === "string" ? note.projectId : "";
    return {
      title:
        String(note.title || "").trim() ||
        String(note.content ?? "").slice(0, 60).trim() ||
        "Notiz",
      tags: Array.isArray(note.tags) ? (note.tags as string[]).slice(0, 8) : [],
      project: projectId ? (projectTitles.get(projectId) ?? null) : null,
      degree: degrees[index],
    };
  });

  return { nodes, edges };
}

function readDocument(req: Context["req"]): Record<string, unknown> | null {
  const candidate = req.bodyJson ?? req.body;
  if (candidate && typeof candidate === "object") {
    return candidate as Record<string, unknown>;
  }
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function extractUserId(permissions: string[] | undefined): string | null {
  for (const permission of permissions ?? []) {
    const match = permission.match(/user:([A-Za-z0-9_.-]+)/);
    if (match) return match[1];
  }
  return null;
}

// Dokumente sind nur über Permissions dem Nutzer zugeordnet; der API-Key
// sieht alles, daher wird hier pro Seite auf den Nutzer gefiltert.
// Für die aktuelle Datenmenge völlig ausreichend; bei echtem Multi-User-
// Wachstum wäre ein indiziertes userId-Attribut der nächste Schritt.
async function listUserDocuments(
  databases: Databases,
  collectionId: string,
  marker: string | null,
): Promise<Record<string, unknown>[]> {
  const documents: Record<string, unknown>[] = [];
  let cursor: string | null = null;

  while (documents.length < 5000) {
    const queries = [Query.limit(100), Query.orderDesc("$createdAt")];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DATABASE_ID, collectionId, queries);

    for (const document of page.documents as unknown as Record<string, unknown>[]) {
      const permissions = (document.$permissions as string[]) ?? [];
      if (!marker || permissions.some((permission) => permission.includes(marker))) {
        documents.push(document);
      }
    }
    if ((page.documents as unknown[]).length < 100) break;
    cursor = (page.documents as unknown as Array<{ $id: string }>)[
      (page.documents as unknown[]).length - 1
    ].$id;
  }

  return documents;
}

// Zeitbudgets innerhalb des 300-s-Function-Limits: bleibt ein Provider
// hängen, degradiert der Worker sauber statt kommentarlos abgeschossen
// zu werden (Notiz bliebe sonst ewig auf "wird analysiert").
const VIDEO_TIMEOUT_MS = 200_000;
const SUMMARY_TIMEOUT_MS = 60_000;
const ENHANCE_TIMEOUT_MS = 90_000;
const OCR_TIMEOUT_MS = 120_000;

async function buildUrlContent(
  sourceUrl: string,
  aiModel: string,
  locale: "de" | "en",
): Promise<{ content: string; title: string }> {
  if (parseYouTubeVideoId(sourceUrl)) {
    const meta = await fetchYouTubeOEmbed(sourceUrl);
    try {
      const content = await summarizeYouTubeVideo({
        url: sourceUrl,
        title: meta?.title,
        author: meta?.author,
        locale,
        timeoutMs: VIDEO_TIMEOUT_MS,
      });
      return { content, title: meta?.title ?? "" };
    } catch (videoError) {
      // Ehrliche Degradierung auf Metadaten, wenn die Video-Analyse scheitert.
      if (!meta) throw videoError;
      const detail =
        videoError instanceof Error && videoError.message ? ` (${videoError.message})` : "";
      const header = [meta.title, meta.author ? `— ${meta.author}` : ""]
        .filter(Boolean)
        .join(" ");
      const content =
        locale === "en"
          ? `YouTube video: ${header}\n${sourceUrl}\n\nAutomatic video analysis was not possible${detail}.`
          : `YouTube-Video: ${header}\n${sourceUrl}\n\nDie automatische Video-Analyse war nicht möglich${detail}.`;
      return { content, title: meta.title ?? "" };
    }
  }

  const resolved = resolveAiModelConfig(aiModel);
  if (!resolved.ok) throw new Error(resolved.error);

  const page = await fetchPublicPage(sourceUrl);
  const isHtml = page.contentType.includes("text/html");
  const title = isHtml ? extractHtmlTitle(page.body) : null;
  const pageText = isHtml ? htmlToText(page.body) : page.body;
  if (!pageText.trim()) {
    throw new Error("Auf der Seite wurde kein lesbarer Text gefunden.");
  }

  const content = await summarizeWebText({
    config: resolved.config,
    pageText,
    url: page.finalUrl,
    title,
    locale,
    timeoutMs: SUMMARY_TIMEOUT_MS,
  });
  return { content, title: title ?? "" };
}

// Angehängte Fotos leben so lange wie ihre Notiz — gelöscht wird nur
// beim Delete-Event, damit keine verwaisten Dateien zurückbleiben.
async function cleanupFile(storage: Storage, doc: Record<string, unknown>) {
  const fileId =
    typeof doc.mediaFileId === "string" && doc.mediaFileId
      ? doc.mediaFileId
      : typeof doc.pendingFileId === "string"
        ? doc.pendingFileId
        : "";
  if (!fileId) return;
  try {
    await storage.deleteFile(BUCKET_ID, fileId);
  } catch {
    // Datei existiert nicht mehr — in Ordnung.
  }
}

// Appwrite-Metafelder und nulls aus App-Objekten entfernen.
function toDocumentData(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).filter(([key, value]) => !key.startsWith("$") && value !== null),
  );
}
