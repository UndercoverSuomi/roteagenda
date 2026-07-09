"use client";

import { ID, Permission, Role, type Models } from "appwrite";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cx,
  buildAiStats,
  collectProjectNotes,
  hasSeenWelcome,
  markWelcomeSeen,
  readErrorMessage,
} from "@/components/app-helpers";
import type {
  AuthMode,
  AuthStatus,
  DataStatus,
  ProjectDetailTab,
  Screen,
  TaskDetailTab,
  TaskFilter,
} from "@/components/app-types";
import { NoteEditor } from "@/components/editors/note-editor";
import { ProjectEditor } from "@/components/editors/project-editor";
import { TaskEditor } from "@/components/editors/task-editor";
import { AuthScreen } from "@/components/screens/auth-screen";
import { CaptureScreen } from "@/components/screens/capture-screen";
import { InboxScreen } from "@/components/screens/inbox-screen";
import { MoreScreen } from "@/components/screens/more-screen";
import { NoteDetailScreen } from "@/components/screens/note-detail-screen";
import { NotesScreen } from "@/components/screens/notes-screen";
import { ProjectDetailScreen } from "@/components/screens/project-detail-screen";
import { ProjectsScreen } from "@/components/screens/projects-screen";
import { SearchScreen } from "@/components/screens/search-screen";
import { TaskDetailScreen } from "@/components/screens/task-detail-screen";
import { TodayScreen } from "@/components/screens/today-screen";
import { WelcomeScreen } from "@/components/screens/welcome-screen";
import { DesktopInsightPanel } from "@/components/ui/insight-panel";
import { BottomNav, DesktopSidebar } from "@/components/ui/navigation";
import { AppShellMessage, WorkSurface } from "@/components/ui/primitives";
import { UndoToast } from "@/components/ui/undo-toast";
import { enhanceNoteWithConfiguredAi, fetchDailyBriefing } from "@/lib/ai-client";
import { fileToJpegBlob } from "@/lib/image";
import { getAiModelLabel, MAX_NOTE_LENGTH, type AiModelId } from "@/lib/ai-models";
import { createEmptyAppData } from "@/lib/app-data";
import { buildAppUrl, parseAppUrl } from "@/lib/app-url";
import { account, client, storage } from "@/lib/appwrite";
import {
  APPWRITE_COLLECTIONS,
  APPWRITE_DATABASE_ID,
  APPWRITE_MEDIA_BUCKET_ID,
} from "@/lib/appwrite-config";
import {
  executeSyncOp,
  loadAppDataForUser,
  type SyncOp,
} from "@/lib/appwrite-store";
import { toIsoDate } from "@/lib/date";
import {
  addEventToGoogleCalendar,
  buildCalendarTemplateUrl,
  isGoogleConfigured,
} from "@/lib/google";
import {
  detectDeviceLocale,
  storeDeviceLocale,
  translate,
  type Locale,
  type Translator,
} from "@/lib/i18n";
import {
  clearCachedAppData,
  clearQueuedOps,
  isNetworkError,
  readCachedAppData,
  readQueuedOps,
  writeCachedAppData,
  writeQueuedOps,
} from "@/lib/offline-store";
import { pickProjectColor } from "@/lib/project-colors";
import { applyRealtimeEvent } from "@/lib/realtime";
import { createSyncQueue, type SyncFailure, type SyncStatus } from "@/lib/sync-queue";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type ThemePreference,
} from "@/lib/theme";
import type {
  AiSuggestion,
  AppData,
  GoogleSyncTarget,
  Note,
  Project,
  Task,
} from "@/lib/types";

type UndoState = { message: string; apply: () => void };
type EnhanceOutcome = { noteId: string; count: number };
type EnhanceError = { noteId: string; message: string };

// Startzustand aus der URL (Deep-Link) bzw. Welcome-Logik ableiten.
// Läuft nur clientseitig; das Server-HTML zeigt ohnehin erst den Auth-Check.
function readInitialLocation(): {
  screen: Screen;
  projectId: string;
  taskId: string;
  noteId: string;
} {
  if (typeof window === "undefined") {
    return { screen: "today", projectId: "", taskId: "", noteId: "" };
  }

  const parsed = parseAppUrl(window.location.search);
  if (parsed.screen === "today") {
    return {
      screen: hasSeenWelcome() ? "today" : "welcome",
      projectId: "",
      taskId: "",
      noteId: "",
    };
  }

  return {
    screen: parsed.screen,
    projectId: parsed.projectId ?? "",
    taskId: parsed.taskId ?? "",
    noteId: parsed.noteId ?? "",
  };
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function RoteAgendaApp() {
  const [data, setData] = useState<AppData>(() => createEmptyAppData());
  const [authUser, setAuthUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const [dataStatus, setDataStatus] = useState<DataStatus>("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  // Initialwert direkt vom Browser; die Lade-Shell rendert nichts davon,
  // daher bleibt die Hydration identisch zum Server-HTML.
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // Kennzeichnet, dass die Daten aus dem lokalen Cache statt von Appwrite kommen.
  const [usedCachedData, setUsedCachedData] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => readInitialLocation().screen);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [projectTab, setProjectTab] = useState<ProjectDetailTab>("tasks");
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>("details");
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => readInitialLocation().projectId,
  );
  const [selectedTaskId, setSelectedTaskId] = useState(() => readInitialLocation().taskId);
  const [selectedNoteId, setSelectedNoteId] = useState(() => readInitialLocation().noteId);
  const [captureText, setCaptureText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSuggestions, setActiveSuggestions] = useState<AiSuggestion[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  // KI-Veredelung: laufende Notizen, letztes Ergebnis und letzter Fehler.
  const [enhancingNoteIds, setEnhancingNoteIds] = useState<Set<string>>(new Set());
  const [enhanceOutcome, setEnhanceOutcome] = useState<EnhanceOutcome | null>(null);
  const [enhanceError, setEnhanceError] = useState<EnhanceError | null>(null);
  // Import von Links/Screenshots auf dem Notizen-Screen.
  const [noteImportUrl, setNoteImportUrl] = useState("");
  const [isImportingNote, setIsImportingNote] = useState(false);
  const [noteImportError, setNoteImportError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const userIdRef = useRef("");
  const dataStatusRef = useRef<DataStatus>("idle");
  const queueHydratedRef = useRef(false);
  const [locale, setLocale] = useState<Locale>("de");
  // Theme beeinflusst kein Server-HTML (nur MoreScreen-Select + Effekt),
  // daher ist die direkte Initialisierung hydration-sicher.
  const [themePref, setThemePref] = useState<ThemePreference>(() => readStoredTheme());

  const t = useMemo<Translator>(
    () => (key, params) => translate(locale, key, params),
    [locale],
  );

  const syncQueue = useMemo(
    () =>
      createSyncQueue<SyncOp>({
        execute: (op) => executeSyncOp(op, userIdRef.current),
        save: (entries, ownedIds) => {
          if (userIdRef.current) {
            writeQueuedOps(userIdRef.current, entries, ownedIds);
          }
        },
        onChange: (status, failure, pending) => {
          setSyncStatus(status);
          setSyncFailure(failure);
          setPendingCount(pending);
        },
      }),
    [],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    dataStatusRef.current = dataStatus;
  }, [dataStatus]);

  useEffect(() => {
    applyTheme(themePref);
    if (themePref !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themePref]);

  // Browser-Zurück/Vor: URL lesen und den App-Zustand nachziehen.
  useEffect(() => {
    function onPopState() {
      const parsed = parseAppUrl(window.location.search);
      setEditingTask(null);
      setEditingProject(null);
      setEditingNote(null);
      setEditingSuggestionId(null);
      setScreen(parsed.screen);
      setSelectedProjectId(parsed.projectId ?? "");
      setSelectedTaskId(parsed.taskId ?? "");
      setSelectedNoteId(parsed.noteId ?? "");
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Service Worker macht die App-Shell offline verfügbar (nur Produktion,
  // damit der Cache nicht mit dem Dev-Server kollidiert).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // Online/Offline beobachten; beim Reconnect Queue flushen und Daten auffrischen.
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      void handleReconnect();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, authUser]);

  // Appwrite Realtime hält andere Geräte und Tabs synchron.
  useEffect(() => {
    if (dataStatus !== "ready" || !authUser) return;

    const channels = Object.values(APPWRITE_COLLECTIONS).map(
      (collectionId) =>
        `databases.${APPWRITE_DATABASE_ID}.collections.${collectionId}.documents`,
    );

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = client.subscribe<Record<string, unknown>>(channels, (message) => {
        setData((current) => applyRealtimeEvent(current, message.events, message.payload));
      });
    } catch {
      unsubscribe = undefined;
    }

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // Socket ist bereits geschlossen.
      }
    };
  }, [dataStatus, authUser]);

  // Jeder Datenstand wird lokal gespiegelt, damit die App offline starten kann.
  useEffect(() => {
    if (dataStatus !== "ready") return;
    const uid = authUser?.$id || data.user.id;
    if (!uid) return;
    writeCachedAppData(uid, data);
  }, [data, dataStatus, authUser]);

  useEffect(() => {
    let isActive = true;

    async function boot() {
      void client.ping().catch(() => undefined);

      // Erst nach der Hydration übernehmen, damit Server- und Client-HTML
      // identisch starten (SSR rendert immer Deutsch).
      await Promise.resolve();
      if (!isActive) return;
      setLocale(detectDeviceLocale());

      try {
        const user = await account.get();
        if (!isActive) return;
        await completeSignIn(user);
      } catch (error) {
        if (!isActive) return;

        // Offline mit vorhandenem Cache: letzten Stand zeigen statt Login.
        const cached = readCachedAppData();
        if (isNetworkError(error) && cached) {
          userIdRef.current = cached.userId;
          hydrateQueueForUser(cached.userId);
          setData(cached.data);
          setLocale(cached.data.settings.locale);
          setUsedCachedData(true);
          setAuthStatus("signedIn");
          setDataStatus("ready");
          return;
        }

        setAuthStatus("signedOut");
        setDataStatus("idle");
      }
    }

    void boot();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lädt die Queue einer früheren Sitzung — aber nur für denselben Nutzer.
  function hydrateQueueForUser(uid: string) {
    if (queueHydratedRef.current) return;
    queueHydratedRef.current = true;

    const stored = readQueuedOps();
    if (!stored) return;
    if (stored.userId !== uid) {
      clearQueuedOps();
      clearCachedAppData();
      return;
    }
    if (stored.entries.length) {
      syncQueue.hydrate(stored.entries);
    }
  }

  async function completeSignIn(user: Models.User<Models.Preferences>) {
    setAuthUser(user);
    userIdRef.current = user.$id;
    setAuthStatus("signedIn");
    setDataStatus("loading");
    hydrateQueueForUser(user.$id);
    // Erst liegengebliebene Änderungen anwenden, dann frisch laden.
    await syncQueue.flush();
    await loadRemoteData(user);
  }

  // Nach einem Verbindungsabbruch: Session prüfen, Queue flushen, neu laden.
  async function handleReconnect() {
    if (authStatus !== "signedIn") return;

    try {
      const user = authUser ?? (await account.get());
      if (!authUser) {
        setAuthUser(user);
        userIdRef.current = user.$id;
      }
      await syncQueue.flush();
      await loadRemoteData(user);
    } catch (error) {
      // Session abgelaufen (kein Netzfehler): sauber abmelden.
      if (!isNetworkError(error)) {
        await handleLogout();
      }
    }
  }

  async function loadRemoteData(user: Models.User<Models.Preferences>) {
    try {
      const remoteData = await loadAppDataForUser(user, detectDeviceLocale());
      setData(remoteData);
      setLocale(remoteData.settings.locale);
      storeDeviceLocale(remoteData.settings.locale);
      setDataError(null);
      setUsedCachedData(false);
      setDataStatus("ready");
    } catch (error) {
      // Fehlgeschlagener Refresh nach erfolgreichem Start: alten Stand behalten.
      if (dataStatusRef.current === "ready") return;
      setDataError(readErrorMessage(error, t));
      setDataStatus("error");
    }
  }

  // Jede Änderung wird sofort optimistisch angezeigt und als serialisierbare
  // Operation in der Queue nach Appwrite geschrieben (überlebt Reloads).
  function persist(label: string, op: SyncOp) {
    if (dataStatus !== "ready") return;
    syncQueue.push(label, op);
  }

  const userId = authUser?.$id || data.user.id;

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const selectedProject = data.projects.find(
    (project) => project.id === selectedProjectId,
  );
  // Das Insight-Panel zeigt ohne Auswahl das erste Projekt als Standard.
  const insightProject = selectedProject ?? data.projects[0];
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId);
  const selectedNote = data.notes.find((note) => note.id === selectedNoteId);

  const projectById = useMemo(() => {
    return new Map(data.projects.map((project) => [project.id, project]));
  }, [data.projects]);

  const pendingSuggestions = data.suggestions.filter(
    (suggestion) => suggestion.state === "pending",
  );

  const visibleTasks = useMemo(() => {
    const today = toIsoDate(new Date());
    return data.tasks
      .filter((task) => {
        // "Heute" zeigt auch Überfälliges, damit nichts unsichtbar liegen bleibt.
        if (taskFilter === "today") return Boolean(task.dueDate && task.dueDate <= today);
        if (taskFilter === "planned") return Boolean(task.dueDate && task.dueDate > today);
        if (taskFilter === "later") return !task.dueDate;
        return true;
      })
      .sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });
  }, [data.tasks, taskFilter]);

  // Zentrale Navigation: Screen-State setzen und die URL synchron halten,
  // damit Browser-Historie und Deep-Links funktionieren.
  function goTo(
    nextScreen: Screen,
    options?: {
      projectId?: string;
      taskId?: string;
      noteId?: string;
      replace?: boolean;
    },
  ) {
    setScreen(nextScreen);
    if (options?.projectId !== undefined) setSelectedProjectId(options.projectId);
    if (options?.taskId !== undefined) setSelectedTaskId(options.taskId);
    if (options?.noteId !== undefined) setSelectedNoteId(options.noteId);

    // Der Welcome-Screen ist bewusst nicht URL-adressierbar.
    if (typeof window === "undefined" || nextScreen === "welcome") return;

    const url = buildAppUrl({
      screen: nextScreen,
      projectId: options?.projectId ?? selectedProjectId ?? null,
      taskId: options?.taskId ?? selectedTaskId ?? null,
      noteId: options?.noteId ?? selectedNoteId ?? null,
    });
    const current = window.location.pathname + window.location.search;
    if (current === url) return;

    window.history[options?.replace ? "replaceState" : "pushState"](null, "", url);
  }

  function navigate(nextScreen: Screen) {
    goTo(nextScreen);
  }

  function openProject(projectId: string) {
    setProjectTab("tasks");
    goTo("project", { projectId });
  }

  function openTask(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (task) {
      setTaskDetailTab("details");
      goTo("task", { taskId, projectId: task.projectId });
    }
  }

  function openNote(noteId: string) {
    goTo("note", { noteId });
  }

  function showUndo(message: string, apply: () => void) {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndo({ message, apply });
    undoTimerRef.current = window.setTimeout(() => {
      setUndo(null);
      undoTimerRef.current = null;
    }, 7000);
  }

  function handleUndoAction() {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    undo?.apply();
    setUndo(null);
  }

  // ── Notizen ────────────────────────────────────────────────────────

  // Zentrale KI-Veredelung: Notiz ausformulieren, taggen, zuordnen,
  // verlinken und Aufgaben-/Terminvorschläge einsammeln.
  async function runNoteEnhancement(baseNote: Note): Promise<AiSuggestion[]> {
    const latest = data.notes.find((note) => note.id === baseNote.id) ?? baseNote;

    setEnhanceError(null);
    setEnhanceOutcome(null);
    setEnhancingNoteIds((current) => new Set(current).add(latest.id));

    try {
      const result = await enhanceNoteWithConfiguredAi({
        noteId: latest.id,
        content: latest.content,
        modelId: data.settings.aiModel,
        projects: data.projects,
        openTasks: data.tasks
          .filter((task) => task.status !== "done")
          .slice(0, 150)
          .map((task) => ({
            title: task.title,
            projectId: task.projectId,
            dueDate: task.dueDate,
          })),
        existingTags: Array.from(new Set(data.notes.flatMap((note) => note.tags))).slice(
          0,
          120,
        ),
        // Alle Notizen als Verlinkungs-Kandidaten (bis zur Prompt-Grenze),
        // mit Inhalts-Snippet — so entsteht ein konsistentes Wissensnetz.
        otherNotes: data.notes
          .filter((note) => note.id !== latest.id)
          .slice(0, 250)
          .map((note) => ({
            id: note.id,
            title: note.title || note.content.slice(0, 60),
            tags: note.tags,
            snippet: (note.enhanced || note.content).slice(0, 200),
          })),
        locale,
      });

      const updated: Note = {
        ...latest,
        title: result.enhancement.title,
        enhanced: result.enhancement.enhanced,
        tags: result.enhancement.tags,
        // Eine manuelle Projektzuordnung wird von der KI nicht gelöscht.
        projectId: result.enhancement.projectId ?? latest.projectId,
        relatedNoteIds: result.enhancement.relatedNoteIds,
        processed: true,
        processingError: null,
        updatedAt: new Date().toISOString(),
      };

      setData((current) => ({
        ...current,
        notes: current.notes.map((note) => (note.id === updated.id ? updated : note)),
        suggestions: [...result.suggestions, ...current.suggestions],
      }));
      persist(t("entity.note"), { kind: "upsert", collection: "notes", item: updated });
      for (const suggestion of result.suggestions) {
        persist(t("entity.suggestion"), {
          kind: "upsert",
          collection: "suggestions",
          item: suggestion,
        });
      }
      setEnhanceOutcome({ noteId: updated.id, count: result.suggestions.length });

      return result.suggestions;
    } catch (error) {
      setEnhanceError({ noteId: latest.id, message: readErrorMessage(error, t) });
      throw error;
    } finally {
      setEnhancingNoteIds((current) => {
        const next = new Set(current);
        next.delete(latest.id);
        return next;
      });
    }
  }

  function createBlankNote() {
    const now = new Date().toISOString();
    setEditingNote({
      id: createLocalId("note"),
      title: "",
      content: "",
      enhanced: "",
      tags: [],
      projectId: null,
      relatedNoteIds: [],
      source: "manual",
      sourceUrl: null,
      pinned: false,
      processed: false,
      pendingFileId: null,
      processingError: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  function saveNote(note: Note) {
    const exists = data.notes.some((item) => item.id === note.id);

    setData((current) => ({
      ...current,
      notes: exists
        ? current.notes.map((item) => (item.id === note.id ? note : item))
        : [note, ...current.notes],
    }));
    setEditingNote(null);
    persist(t("entity.note"), { kind: "upsert", collection: "notes", item: note });

    // Neue Notizen landen direkt in der Detailansicht und werden
    // automatisch von der KI veredelt.
    if (!exists) {
      goTo("note", { noteId: note.id });
      void runNoteEnhancement(note).catch(() => undefined);
    }
  }

  function restoreNotes(notes: Note[]) {
    setData((current) => ({
      ...current,
      notes: [...notes, ...current.notes],
    }));
    for (const note of notes) {
      persist(t("entity.note"), { kind: "upsert", collection: "notes", item: note });
    }
  }

  function deleteNote(noteId: string) {
    const target = data.notes.find((note) => note.id === noteId);

    setData((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== noteId),
    }));
    setEditingNote(null);
    if (screen === "note" && selectedNoteId === noteId) {
      goTo("notes", { replace: true, noteId: "" });
    }
    persist(t("entity.noteDelete"), { kind: "delete", collection: "notes", id: noteId });

    if (target) {
      showUndo(t("undo.noteDeleted"), () => restoreNotes([target]));
    }
  }

  // Legt eine Import-Notiz an (Link/Screenshot) und öffnet sie. Die
  // eigentliche Analyse macht der Notiz-Worker (Appwrite Function)
  // asynchron — die Notiz füllt sich per Realtime von selbst.
  function createPendingImportNote(input: {
    source: "url" | "image";
    sourceUrl: string | null;
    pendingFileId: string | null;
  }): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: createLocalId("note"),
      title: "",
      content: "",
      enhanced: "",
      tags: [],
      projectId: null,
      relatedNoteIds: [],
      source: input.source,
      sourceUrl: input.sourceUrl,
      pinned: false,
      processed: false,
      pendingFileId: input.pendingFileId,
      processingError: null,
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({ ...current, notes: [note, ...current.notes] }));
    persist(t("entity.note"), { kind: "upsert", collection: "notes", item: note });
    goTo("note", { noteId: note.id });

    return note;
  }

  function handleImportUrl() {
    const url = noteImportUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return;

    setNoteImportError(null);
    setNoteImportUrl("");
    createPendingImportNote({ source: "url", sourceUrl: url, pendingFileId: null });
  }

  async function handleImportImage(file: File) {
    setNoteImportError(null);
    setIsImportingNote(true);
    try {
      // Verkleinertes JPEG in den Storage-Bucket laden; der Worker liest
      // und löscht die Datei nach der Analyse.
      const blob = await fileToJpegBlob(file);
      const uploaded = await storage.createFile({
        bucketId: APPWRITE_MEDIA_BUCKET_ID,
        fileId: ID.unique(),
        file: new File([blob], "note.jpg", { type: "image/jpeg" }),
        permissions: [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ],
      });
      createPendingImportNote({
        source: "image",
        sourceUrl: null,
        pendingFileId: uploaded.$id,
      });
    } catch (error) {
      setNoteImportError(readErrorMessage(error, t));
    } finally {
      setIsImportingNote(false);
    }
  }

  function toggleNotePin(noteId: string) {
    const target = data.notes.find((note) => note.id === noteId);
    if (!target) return;

    const updated: Note = {
      ...target,
      pinned: !target.pinned,
      updatedAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === noteId ? updated : note)),
    }));
    persist(t("entity.note"), { kind: "upsert", collection: "notes", item: updated });
  }

  // ── Capture (Schnellnotiz) ─────────────────────────────────────────

  async function handleProcessNote() {
    const trimmed = captureText.trim();
    if (!trimmed) return;

    setCaptureError(null);
    setCaptureNotice(null);
    setIsProcessingNote(true);

    // Reine URL? Dann als Link-Notiz anlegen — der Worker analysiert asynchron.
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      setCaptureText("");
      setIsProcessingNote(false);
      createPendingImportNote({ source: "url", sourceUrl: trimmed, pendingFileId: null });
      return;
    }

    // Die Notiz existiert sofort — auch wenn die KI danach scheitert.
    const now = new Date().toISOString();
    const note: Note = {
      id: createLocalId("note"),
      title: "",
      content: trimmed,
      enhanced: "",
      tags: [],
      projectId: null,
      relatedNoteIds: [],
      source: "capture",
      sourceUrl: null,
      pinned: false,
      processed: false,
      pendingFileId: null,
      processingError: null,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, notes: [note, ...current.notes] }));
    persist(t("entity.note"), { kind: "upsert", collection: "notes", item: note });
    setCaptureText("");

    try {
      const suggestions = await runNoteEnhancement(note);
      setActiveSuggestions(suggestions);
      if (!suggestions.length) {
        setCaptureNotice(t("capture.noNewTasks"));
      }
    } catch (error) {
      setCaptureError(readErrorMessage(error, t));
    } finally {
      setIsProcessingNote(false);
    }
  }

  function appendCaptureText(transcript: string) {
    setCaptureText((current) => {
      const joined = current.trim() ? `${current.trimEnd()} ${transcript}` : transcript;
      return joined.slice(0, MAX_NOTE_LENGTH);
    });
  }

  // ── Vorschläge ─────────────────────────────────────────────────────

  function updateSuggestion(updated: AiSuggestion) {
    setActiveSuggestions((current) =>
      current.map((suggestion) => (suggestion.id === updated.id ? updated : suggestion)),
    );
    setData((current) => ({
      ...current,
      suggestions: current.suggestions.map((suggestion) =>
        suggestion.id === updated.id ? updated : suggestion,
      ),
    }));
    persist(t("entity.suggestion"), {
      kind: "upsert",
      collection: "suggestions",
      item: updated,
    });
  }

  function markSuggestionAccepted(suggestion: AiSuggestion) {
    const accepted = { ...suggestion, state: "accepted" as const, needsReview: false };
    setData((current) => ({
      ...current,
      suggestions: current.suggestions.map((item) =>
        item.id === suggestion.id ? accepted : item,
      ),
    }));
    setActiveSuggestions((current) =>
      current.map((item) => (item.id === suggestion.id ? accepted : item)),
    );
    persist(t("entity.suggestion"), {
      kind: "upsert",
      collection: "suggestions",
      item: accepted,
    });
  }

  // Terminvorschlag: an Google Kalender übergeben, keine App-Aufgabe.
  async function acceptEventSuggestion(suggestion: AiSuggestion) {
    if (!suggestion.eventStart) return;

    const event = {
      title: suggestion.suggestedTitle,
      description: suggestion.suggestedDescription,
      start: suggestion.eventStart,
      end: suggestion.eventEnd,
    };

    if (!isGoogleConfigured) {
      window.open(buildCalendarTemplateUrl(event), "_blank", "noopener");
      markSuggestionAccepted(suggestion);
      return;
    }

    // Das Fallback-Fenster muss synchron zur Nutzer-Geste aufgehen: ein
    // window.open nach dem await würde der Popup-Blocker schlucken und der
    // Termin ginge still verloren, obwohl der Vorschlag "akzeptiert" wäre.
    const fallback = window.open("about:blank", "_blank");
    if (fallback) fallback.opener = null;

    try {
      await addEventToGoogleCalendar(event);
      fallback?.close();
      markSuggestionAccepted(suggestion);
    } catch {
      if (fallback) {
        // API fehlgeschlagen → Vorbefüll-Seite; der Nutzer bestätigt dort.
        fallback.location.href = buildCalendarTemplateUrl(event);
        markSuggestionAccepted(suggestion);
      }
      // Ohne Fenster (Popup-Blocker) bleibt der Vorschlag offen,
      // damit ein erneuter Klick es noch einmal versuchen kann.
    }
  }

  function handleSuggestionAccept(suggestion: AiSuggestion, createdBy: "ai" | "user" = "ai") {
    if (suggestion.kind === "event") {
      void acceptEventSuggestion(suggestion);
      return;
    }
    acceptSuggestion(suggestion, createdBy);
  }

  function acceptSuggestion(suggestion: AiSuggestion, createdBy: "ai" | "user" = "ai") {
    const now = new Date().toISOString();
    let projectId = suggestion.suggestedProjectId;
    let newProject: Project | null = null;

    if (!projectId) {
      projectId = createLocalId("project");
      newProject = {
        id: projectId,
        title: suggestion.suggestedNewProjectTitle ?? t("sugg.newProjectLabel"),
        description: "",
        keywords: suggestion.suggestedTitle
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 4)
          .slice(0, 6),
        color: pickProjectColor(data.projects.length),
        progress: 0,
        aiEnabled: true,
        createdAt: now,
        updatedAt: now,
      };
    }

    const task: Task = {
      id: createLocalId("task"),
      title: suggestion.suggestedTitle,
      description: suggestion.suggestedDescription,
      projectId,
      status: "open",
      priority: suggestion.priority,
      dueDate: suggestion.dueDate,
      sourceNoteId: suggestion.rawNoteId,
      createdBy,
      googleSynced: null,
      createdAt: now,
      updatedAt: now,
    };

    const acceptedSuggestion = {
      ...suggestion,
      state: "accepted" as const,
      needsReview: false,
    };

    setData((current) => ({
      ...current,
      projects: newProject ? [newProject, ...current.projects] : current.projects,
      tasks: [task, ...current.tasks],
      suggestions: current.suggestions.map((item) =>
        item.id === suggestion.id ? acceptedSuggestion : item,
      ),
    }));
    setActiveSuggestions((current) =>
      current.map((item) => (item.id === suggestion.id ? acceptedSuggestion : item)),
    );
    // In der Inbox bleiben, damit sich der Stapel am Stück abarbeiten lässt;
    // aus der Schnellnotiz heraus zeigt "Heute" die neue Aufgabe.
    if (screen === "inbox") {
      setSelectedProjectId(projectId);
      setSelectedTaskId(task.id);
    } else {
      goTo("today", { projectId, taskId: task.id });
    }

    if (newProject) {
      persist(t("entity.projectNew"), {
        kind: "upsert",
        collection: "projects",
        item: newProject,
      });
    }
    persist(t("entity.task"), { kind: "upsert", collection: "tasks", item: task });
    persist(t("entity.suggestion"), {
      kind: "upsert",
      collection: "suggestions",
      item: acceptedSuggestion,
    });
  }

  function rejectSuggestion(suggestionId: string) {
    const target = data.suggestions.find((suggestion) => suggestion.id === suggestionId);
    if (!target) return;

    const rejected = { ...target, state: "rejected" as const };
    setData((current) => ({
      ...current,
      suggestions: current.suggestions.map((suggestion) =>
        suggestion.id === suggestionId ? rejected : suggestion,
      ),
    }));
    setActiveSuggestions((current) =>
      current.map((suggestion) => (suggestion.id === suggestionId ? rejected : suggestion)),
    );
    persist(t("entity.suggestion"), {
      kind: "upsert",
      collection: "suggestions",
      item: rejected,
    });
  }

  // ── Aufgaben ───────────────────────────────────────────────────────

  function updateStoredTask(updated: Task) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === updated.id ? updated : task)),
    }));
    persist(t("entity.task"), { kind: "upsert", collection: "tasks", item: updated });
  }

  function toggleTask(taskId: string) {
    const target = data.tasks.find((task) => task.id === taskId);
    if (!target) return;

    updateStoredTask({
      ...target,
      status: target.status === "done" ? "open" : "done",
      updatedAt: new Date().toISOString(),
    });
  }

  function rescheduleTask(taskId: string, dueDate: string | null) {
    const target = data.tasks.find((task) => task.id === taskId);
    if (!target || target.dueDate === dueDate) return;

    updateStoredTask({ ...target, dueDate, updatedAt: new Date().toISOString() });
  }

  function markTaskGoogleSynced(taskId: string, targetService: GoogleSyncTarget) {
    const target = data.tasks.find((task) => task.id === taskId);
    if (!target) return;

    updateStoredTask({
      ...target,
      googleSynced: targetService,
      updatedAt: new Date().toISOString(),
    });
  }

  function saveTask(task: Task) {
    setData((current) => {
      const exists = current.tasks.some((item) => item.id === task.id);
      return {
        ...current,
        tasks: exists
          ? current.tasks.map((item) => (item.id === task.id ? task : item))
          : [task, ...current.tasks],
      };
    });
    setSelectedTaskId(task.id);
    setSelectedProjectId(task.projectId);
    setEditingTask(null);
    persist(t("entity.task"), { kind: "upsert", collection: "tasks", item: task });
  }

  function restoreTasks(tasks: Task[]) {
    setData((current) => ({
      ...current,
      tasks: [...tasks, ...current.tasks],
    }));
    for (const task of tasks) {
      persist(t("entity.task"), { kind: "upsert", collection: "tasks", item: task });
    }
  }

  function restoreProject(project: Project, tasks: Task[]) {
    setData((current) => ({
      ...current,
      projects: [project, ...current.projects],
      tasks: [...tasks, ...current.tasks],
    }));
    persist(t("entity.project"), { kind: "upsert", collection: "projects", item: project });
    for (const task of tasks) {
      persist(t("entity.task"), { kind: "upsert", collection: "tasks", item: task });
    }
  }

  function deleteTask(taskId: string) {
    const target = data.tasks.find((task) => task.id === taskId);

    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
    setEditingTask(null);
    goTo("today", { replace: true });
    persist(t("entity.taskDelete"), { kind: "delete", collection: "tasks", id: taskId });

    if (target) {
      showUndo(t("undo.taskDeleted"), () => restoreTasks([target]));
    }
  }

  // ── Projekte ───────────────────────────────────────────────────────

  function toggleProjectAi(projectId: string) {
    const target = data.projects.find((project) => project.id === projectId);
    if (!target) return;

    const updated: Project = {
      ...target,
      aiEnabled: !target.aiEnabled,
      updatedAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? updated : project,
      ),
    }));
    persist(t("entity.project"), { kind: "upsert", collection: "projects", item: updated });
  }

  function saveProject(project: Project) {
    setData((current) => {
      const exists = current.projects.some((item) => item.id === project.id);
      return {
        ...current,
        projects: exists
          ? current.projects.map((item) => (item.id === project.id ? project : item))
          : [project, ...current.projects],
      };
    });
    setSelectedProjectId(project.id);
    setEditingProject(null);
    persist(t("entity.project"), { kind: "upsert", collection: "projects", item: project });
  }

  function deleteProject(projectId: string) {
    const targetProject = data.projects.find((project) => project.id === projectId);
    const projectTasks = data.tasks.filter((task) => task.projectId === projectId);

    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
    }));
    setEditingProject(null);
    goTo("projects", {
      replace: true,
      ...(selectedProjectId === projectId ? { projectId: "" } : {}),
    });

    for (const task of projectTasks) {
      persist(t("entity.taskDelete"), { kind: "delete", collection: "tasks", id: task.id });
    }
    persist(t("entity.projectDelete"), {
      kind: "delete",
      collection: "projects",
      id: projectId,
    });

    if (targetProject) {
      showUndo(t("undo.projectDeleted"), () =>
        restoreProject(targetProject, projectTasks),
      );
    }
  }

  function createBlankProject() {
    const now = new Date().toISOString();
    setEditingProject({
      id: createLocalId("project"),
      title: "",
      description: "",
      keywords: [],
      color: pickProjectColor(data.projects.length),
      progress: 0,
      aiEnabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  function createBlankTask(projectId = selectedProject?.id ?? data.projects[0]?.id) {
    if (!projectId) return;

    const now = new Date().toISOString();
    setEditingTask({
      id: createLocalId("task"),
      title: "",
      description: "",
      projectId,
      status: "open",
      priority: "medium",
      dueDate: null,
      sourceNoteId: null,
      createdBy: "user",
      googleSynced: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ── Konto & Einstellungen ──────────────────────────────────────────

  async function handleAuthSubmit({
    email,
    password,
    name,
  }: {
    email: string;
    password: string;
    name: string;
  }) {
    setAuthError(null);
    setRecoverySent(false);
    setIsAuthSubmitting(true);

    try {
      if (authMode === "recover") {
        await account.createRecovery({
          email,
          url: `${window.location.origin}/reset-password`,
        });
        setRecoverySent(true);
        return;
      }

      if (authMode === "register") {
        await account.create({
          userId: ID.unique(),
          email,
          password,
          name: name.trim() || email,
        });
      }

      await account.createEmailPasswordSession({ email, password });
      const user = await account.get();
      await completeSignIn(user);
    } catch (error) {
      setAuthError(readErrorMessage(error, t));
      setAuthStatus("signedOut");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await account.deleteSession("current");
    } catch {
      // The local UI should still leave the authenticated area if the session is already gone.
    }

    // Lokale Spuren des Nutzers entfernen (Cache + Warteschlange).
    syncQueue.clear();
    clearQueuedOps();
    clearCachedAppData();
    queueHydratedRef.current = false;
    userIdRef.current = "";

    setAuthUser(null);
    setAuthStatus("signedOut");
    setDataStatus("idle");
    setData(createEmptyAppData(locale));
    setActiveSuggestions([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setSelectedNoteId("");
    setSearchQuery("");
    setUndo(null);
    setUsedCachedData(false);
    setBriefing(null);
    setBriefingError(null);
    setCaptureNotice(null);
    setEnhanceOutcome(null);
    setEnhanceError(null);
    setNoteImportUrl("");
    setNoteImportError(null);
    setScreen(hasSeenWelcome() ? "today" : "welcome");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  }

  function handleDeleteAllData() {
    setData((current) => ({
      ...createEmptyAppData(locale),
      user: current.user,
      settings: current.settings,
    }));
    setActiveSuggestions([]);
    setUndo(null);
    setBriefing(null);
    setEnhanceOutcome(null);
    setEnhanceError(null);
    goTo("today", { replace: true, projectId: "", taskId: "", noteId: "" });
    persist(t("entity.deleteAll"), { kind: "deleteAll" });
  }

  function handleAiModelChange(aiModel: AiModelId) {
    const settings = { ...data.settings, aiModel };
    setData((current) => ({
      ...current,
      settings,
    }));
    persist(t("entity.settings"), { kind: "saveSettings", settings });
  }

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    storeDeviceLocale(nextLocale);

    if (dataStatus === "ready") {
      const settings = { ...data.settings, locale: nextLocale };
      setData((current) => ({ ...current, settings }));
      persist(translate(nextLocale, "entity.settings"), {
        kind: "saveSettings",
        settings,
      });
    }
  }

  function handleThemeChange(preference: ThemePreference) {
    setThemePref(preference);
    storeTheme(preference);
  }

  async function handleGenerateBriefing() {
    const openTasks = data.tasks.filter((task) => task.status !== "done");
    setBriefingError(null);

    // Ohne offene Aufgaben braucht es keinen KI-Aufruf.
    if (!openTasks.length) {
      setBriefing(t("briefing.empty"));
      return;
    }

    setIsBriefingLoading(true);
    try {
      const text = await fetchDailyBriefing({
        modelId: data.settings.aiModel,
        locale,
        tasks: openTasks.slice(0, 100).map((task) => ({
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          project: projectById.get(task.projectId)?.title ?? null,
        })),
      });
      setBriefing(text);
    } catch (error) {
      setBriefingError(readErrorMessage(error, t));
    } finally {
      setIsBriefingLoading(false);
    }
  }

  if (authStatus === "loading") {
    return <AppShellMessage title="Rote Agenda" text={t("boot.checkingSession")} />;
  }

  if (authStatus === "signedOut") {
    return (
      <AuthScreen
        mode={authMode}
        error={authError}
        notice={recoverySent ? t("auth.recoverySent") : null}
        isSubmitting={isAuthSubmitting}
        locale={locale}
        themePref={themePref}
        t={t}
        onLocaleChange={handleLocaleChange}
        onThemeChange={handleThemeChange}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthError(null);
          setRecoverySent(false);
        }}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (dataStatus === "loading") {
    return <AppShellMessage title="Rote Agenda" text={t("boot.loadingData")} />;
  }

  if (dataStatus === "error") {
    return (
      <AppShellMessage
        title={t("boot.setupTitle")}
        text={dataError ?? t("boot.loadErrorFallback")}
        actionLabel={t("more.logout")}
        onAction={handleLogout}
      />
    );
  }

  const screenContent = (() => {
    if (screen === "welcome") {
      return (
        <WelcomeScreen
          t={t}
          onStart={() => {
            markWelcomeSeen();
            navigate("today");
          }}
        />
      );
    }

    if (screen === "capture") {
      return (
        <CaptureScreen
          captureText={captureText}
          suggestions={activeSuggestions}
          projects={data.projects}
          editingSuggestionId={editingSuggestionId}
          modelLabel={getAiModelLabel(data.settings.aiModel)}
          error={captureError}
          notice={captureNotice}
          isProcessing={isProcessingNote}
          locale={locale}
          t={t}
          onBack={() => navigate("today")}
          onChangeText={setCaptureText}
          onAppendText={appendCaptureText}
          onProcess={handleProcessNote}
          onAccept={handleSuggestionAccept}
          onReject={rejectSuggestion}
          onEditSuggestion={setEditingSuggestionId}
          onUpdateSuggestion={updateSuggestion}
        />
      );
    }

    if (screen === "inbox") {
      return (
        <InboxScreen
          suggestions={pendingSuggestions}
          projects={data.projects}
          editingSuggestionId={editingSuggestionId}
          locale={locale}
          t={t}
          onEditSuggestion={setEditingSuggestionId}
          onUpdateSuggestion={updateSuggestion}
          onAccept={handleSuggestionAccept}
          onReject={rejectSuggestion}
          onOpenMore={() => navigate("more")}
        />
      );
    }

    if (screen === "notes") {
      return (
        <NotesScreen
          notes={data.notes}
          projectById={projectById}
          importUrl={noteImportUrl}
          isImporting={isImportingNote}
          importError={noteImportError}
          t={t}
          onOpenNote={openNote}
          onCreateNote={createBlankNote}
          onTogglePin={toggleNotePin}
          onImportUrlChange={setNoteImportUrl}
          onImportUrl={() => void handleImportUrl()}
          onImportImage={(file) => void handleImportImage(file)}
        />
      );
    }

    if (screen === "note" && selectedNote) {
      return (
        <NoteDetailScreen
          note={selectedNote}
          project={
            selectedNote.projectId ? projectById.get(selectedNote.projectId) : undefined
          }
          relatedNotes={data.notes.filter(
            (note) =>
              note.id !== selectedNote.id &&
              (selectedNote.relatedNoteIds.includes(note.id) ||
                note.relatedNoteIds.includes(selectedNote.id)),
          )}
          linkedTasks={data.tasks.filter((task) => task.sourceNoteId === selectedNote.id)}
          isEnhancing={enhancingNoteIds.has(selectedNote.id)}
          enhanceError={
            enhanceError?.noteId === selectedNote.id ? enhanceError.message : null
          }
          newSuggestionCount={
            enhanceOutcome?.noteId === selectedNote.id ? enhanceOutcome.count : 0
          }
          locale={locale}
          t={t}
          onBack={() => navigate("notes")}
          onEdit={() => setEditingNote(selectedNote)}
          onTogglePin={() => toggleNotePin(selectedNote.id)}
          onEnhance={() => void runNoteEnhancement(selectedNote).catch(() => undefined)}
          onOpenNote={openNote}
          onOpenTask={openTask}
          onToggleTask={toggleTask}
          onOpenProject={openProject}
          onOpenInbox={() => navigate("inbox")}
        />
      );
    }

    if (screen === "projects") {
      return (
        <ProjectsScreen
          projects={data.projects}
          tasks={data.tasks}
          locale={locale}
          t={t}
          onOpenProject={openProject}
          onCreateProject={createBlankProject}
        />
      );
    }

    if (screen === "project" && selectedProject) {
      return (
        <ProjectDetailScreen
          project={selectedProject}
          tasks={data.tasks.filter((task) => task.projectId === selectedProject.id)}
          notes={collectProjectNotes(data, selectedProject.id)}
          tab={projectTab}
          locale={locale}
          t={t}
          onBack={() => navigate("projects")}
          onTabChange={setProjectTab}
          onOpenTask={openTask}
          onToggleTask={toggleTask}
          onOpenNote={openNote}
          onAddTask={() => createBlankTask(selectedProject.id)}
          onToggleAi={() => toggleProjectAi(selectedProject.id)}
          onEdit={() => setEditingProject(selectedProject)}
        />
      );
    }

    if (screen === "task" && selectedTask) {
      return (
        <TaskDetailScreen
          task={selectedTask}
          project={projectById.get(selectedTask.projectId)}
          rawNote={data.notes.find((note) => note.id === selectedTask.sourceNoteId)}
          suggestion={data.suggestions.find(
            (suggestion) => suggestion.rawNoteId === selectedTask.sourceNoteId,
          )}
          tab={taskDetailTab}
          locale={locale}
          t={t}
          onBack={() => navigate("today")}
          onTabChange={setTaskDetailTab}
          onEdit={() => setEditingTask(selectedTask)}
          onToggleDone={() => toggleTask(selectedTask.id)}
          onOpenProject={() => openProject(selectedTask.projectId)}
          onReschedule={(dueDate) => rescheduleTask(selectedTask.id, dueDate)}
          onGoogleSynced={(target) => markTaskGoogleSynced(selectedTask.id, target)}
        />
      );
    }

    if (screen === "search") {
      return (
        <SearchScreen
          query={searchQuery}
          tasks={data.tasks}
          projects={data.projects}
          notes={data.notes}
          projectById={projectById}
          locale={locale}
          t={t}
          onQueryChange={setSearchQuery}
          onBack={() => navigate("today")}
          onOpenTask={openTask}
          onOpenProject={openProject}
          onOpenNote={openNote}
          onToggleTask={toggleTask}
        />
      );
    }

    if (screen === "more") {
      return (
        <MoreScreen
          userName={authUser?.name || data.user.name}
          userEmail={authUser?.email || data.user.email}
          aiModel={data.settings.aiModel}
          locale={locale}
          themePref={themePref}
          syncStatus={syncStatus}
          isOnline={isOnline}
          t={t}
          onAiModelChange={handleAiModelChange}
          onLocaleChange={handleLocaleChange}
          onThemeChange={handleThemeChange}
          onDeleteAll={handleDeleteAllData}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <TodayScreen
        tasks={visibleTasks}
        projects={projectById}
        filter={taskFilter}
        aiStats={buildAiStats(data)}
        briefing={briefing}
        briefingError={briefingError}
        isBriefingLoading={isBriefingLoading}
        locale={locale}
        t={t}
        onFilterChange={setTaskFilter}
        onOpenTask={openTask}
        onOpenProject={openProject}
        onToggleTask={toggleTask}
        onCapture={() => navigate("capture")}
        onOpenInbox={() => navigate("inbox")}
        onOpenMore={() => navigate("more")}
        onOpenSearch={() => navigate("search")}
        onGenerateBriefing={() => void handleGenerateBriefing()}
        onDismissBriefing={() => setBriefing(null)}
      />
    );
  })();

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] md:p-6">
      <div
        className={cx(
          "mx-auto grid min-h-screen w-full max-w-[1500px] items-start gap-6 md:min-h-0",
          screen === "welcome"
            ? "md:grid-cols-1"
            : "md:grid-cols-[248px_minmax(0,1fr)_320px]",
        )}
      >
        {screen !== "welcome" ? (
          <DesktopSidebar
            screen={screen}
            pendingCount={pendingSuggestions.length}
            themePref={themePref}
            t={t}
            onNavigate={navigate}
            onThemeChange={handleThemeChange}
          />
        ) : null}

        <WorkSurface hasBottomNav={screen !== "welcome"}>
          {!isOnline ? (
            <div className="mx-6 mt-4 rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 md:mx-8">
              <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
                {pendingCount
                  ? t(
                      pendingCount === 1
                        ? "sync.offlinePending.one"
                        : "sync.offlinePending.many",
                      { count: pendingCount },
                    )
                  : t("sync.offline")}
                {usedCachedData ? ` ${t("sync.cachedNotice")}` : ""}
              </p>
            </div>
          ) : syncFailure ? (
            <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 md:mx-8">
              <p className="text-[12px] leading-5 text-[var(--red)]">
                {t("sync.failed", { label: syncFailure.label, detail: syncFailure.detail })}
              </p>
              <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => syncQueue.retry()}
                  className="rounded-[4px] bg-[var(--red)] px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  {t("common.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => syncQueue.discardCurrent()}
                  className="rounded-[4px] border border-[var(--red)] px-3 py-1.5 text-[11px] font-bold text-[var(--red)]"
                >
                  {t("sync.discard")}
                </button>
              </div>
            </div>
          ) : null}
          {screenContent}
          {screen !== "welcome" ? (
            <BottomNav
              screen={screen}
              pendingCount={pendingSuggestions.length}
              t={t}
              onNavigate={navigate}
            />
          ) : null}
        </WorkSurface>

        {screen !== "welcome" ? (
          <DesktopInsightPanel
            data={data}
            selectedProject={insightProject}
            t={t}
            onCapture={() => navigate("capture")}
            onOpenInbox={() => navigate("inbox")}
          />
        ) : null}
      </div>

      {editingTask ? (
        <TaskEditor
          task={editingTask}
          isNew={!data.tasks.some((task) => task.id === editingTask.id)}
          projects={data.projects}
          t={t}
          onClose={() => setEditingTask(null)}
          onDelete={deleteTask}
          onSave={saveTask}
        />
      ) : null}

      {editingProject ? (
        <ProjectEditor
          project={editingProject}
          isNew={!data.projects.some((project) => project.id === editingProject.id)}
          taskCount={data.tasks.filter((task) => task.projectId === editingProject.id).length}
          t={t}
          onClose={() => setEditingProject(null)}
          onDelete={deleteProject}
          onSave={saveProject}
        />
      ) : null}

      {editingNote ? (
        <NoteEditor
          note={editingNote}
          isNew={!data.notes.some((note) => note.id === editingNote.id)}
          projects={data.projects}
          t={t}
          onClose={() => setEditingNote(null)}
          onDelete={deleteNote}
          onSave={saveNote}
        />
      ) : null}

      {undo ? (
        <UndoToast
          message={undo.message}
          actionLabel={t("common.undo")}
          onAction={handleUndoAction}
        />
      ) : null}
    </main>
  );
}
