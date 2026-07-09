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

import { Client, Databases, Storage, Users, Query } from "node-appwrite";
import {
  enhanceNoteWithProvider,
  extractImageText,
  resolveAiModelConfig,
  summarizeWebText,
  summarizeYouTubeVideo,
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
const BUCKET_ID = process.env.APPWRITE_MEDIA_BUCKET_ID || "noteMedia";

type Context = {
  req: { body?: unknown; bodyJson?: unknown; headers: Record<string, string> };
  res: { json: (data: unknown, status?: number) => unknown };
  log: (message: string) => void;
  error: (message: string) => void;
};

export default async ({ req, res, log, error }: Context) => {
  const doc = readDocument(req);
  if (!doc || typeof doc.$id !== "string") {
    return res.json({ skipped: "kein Dokument im Event" });
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT ?? "")
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID ?? "")
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const databases = new Databases(client);
  const storage = new Storage(client);
  const users = new Users(client);

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
      content = await extractImageText({ imageBase64, locale });
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
      await cleanupFile(storage, doc);
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

    await databases.updateDocument(DATABASE_ID, NOTES_ID, noteId, {
      content: content.slice(0, 8000),
      title: (enhancement.title || sourceTitle).slice(0, 250),
      enhanced: enhancement.enhanced.slice(0, 19000),
      tags: enhancement.tags,
      projectId: enhancement.projectId ?? (doc.projectId as string | null) ?? null,
      relatedNoteIds: enhancement.relatedNoteIds,
      processed: true,
      pendingFileId: null,
      processingError: null,
      updatedAt: now(),
    });

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
        error(`Vorschlag konnte nicht gespeichert werden: ${String(suggestionError)}`);
      }
    }

    await cleanupFile(storage, doc);
    log(`Fertig: ${suggestions.length} Vorschläge`);
    return res.json({ ok: true, suggestions: suggestions.length });
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
    await cleanupFile(storage, doc);

    // 200 zurückgeben: Der Fehler steht in der Notiz, kein Event-Retry nötig.
    return res.json({ ok: false, error: message });
  }
};

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
  });
  return { content, title: title ?? "" };
}

async function cleanupFile(storage: Storage, doc: Record<string, unknown>) {
  const fileId = typeof doc.pendingFileId === "string" ? doc.pendingFileId : "";
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
