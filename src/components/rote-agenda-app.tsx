"use client";

import { ID, type Models } from "appwrite";
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
import { ProjectEditor } from "@/components/editors/project-editor";
import { TaskEditor } from "@/components/editors/task-editor";
import { AuthScreen } from "@/components/screens/auth-screen";
import { CaptureScreen } from "@/components/screens/capture-screen";
import { InboxScreen } from "@/components/screens/inbox-screen";
import { MoreScreen } from "@/components/screens/more-screen";
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
import { processRawNoteWithConfiguredAi } from "@/lib/ai-client";
import { getAiModelLabel, MAX_NOTE_LENGTH, type AiModelId } from "@/lib/ai-models";
import { createEmptyAppData } from "@/lib/app-data";
import { buildAppUrl, parseAppUrl } from "@/lib/app-url";
import { account, client } from "@/lib/appwrite";
import {
  deleteAllUserData,
  deleteItem,
  loadAppDataForUser,
  saveSettings,
  upsertItem,
} from "@/lib/appwrite-store";
import { toIsoDate } from "@/lib/date";
import {
  detectDeviceLocale,
  storeDeviceLocale,
  translate,
  type Locale,
  type Translator,
} from "@/lib/i18n";
import { pickProjectColor } from "@/lib/project-colors";
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
  Project,
  Task,
} from "@/lib/types";

type UndoState = { message: string; apply: () => void };

// Startzustand aus der URL (Deep-Link) bzw. Welcome-Logik ableiten.
// Läuft nur clientseitig; das Server-HTML zeigt ohnehin erst den Auth-Check.
function readInitialLocation(): { screen: Screen; projectId: string; taskId: string } {
  if (typeof window === "undefined") {
    return { screen: "today", projectId: "", taskId: "" };
  }

  const parsed = parseAppUrl(window.location.search);
  if (parsed.screen === "today") {
    return {
      screen: hasSeenWelcome() ? "today" : "welcome",
      projectId: "",
      taskId: "",
    };
  }

  return {
    screen: parsed.screen,
    projectId: parsed.projectId ?? "",
    taskId: parsed.taskId ?? "",
  };
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
  const [screen, setScreen] = useState<Screen>(() => readInitialLocation().screen);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [projectTab, setProjectTab] = useState<ProjectDetailTab>("tasks");
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>("details");
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => readInitialLocation().projectId,
  );
  const [selectedTaskId, setSelectedTaskId] = useState(() => readInitialLocation().taskId);
  const [captureText, setCaptureText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSuggestions, setActiveSuggestions] = useState<AiSuggestion[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<number | null>(null);
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
      createSyncQueue((status, failure) => {
        setSyncStatus(status);
        setSyncFailure(failure);
      }),
    [],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
      setEditingSuggestionId(null);
      setScreen(parsed.screen);
      setSelectedProjectId(parsed.projectId ?? "");
      setSelectedTaskId(parsed.taskId ?? "");
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

        setAuthUser(user);
        setAuthStatus("signedIn");
        setDataStatus("loading");
        await loadRemoteData(user);
      } catch {
        if (!isActive) return;
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

  async function loadRemoteData(user: Models.User<Models.Preferences>) {
    try {
      const remoteData = await loadAppDataForUser(user, detectDeviceLocale());
      setData(remoteData);
      setLocale(remoteData.settings.locale);
      storeDeviceLocale(remoteData.settings.locale);
      setDataError(null);
      setDataStatus("ready");
    } catch (error) {
      setDataError(readErrorMessage(error, t));
      setDataStatus("error");
    }
  }

  // Jede Änderung wird sofort optimistisch angezeigt und in der Queue
  // nacheinander nach Appwrite geschrieben.
  function persist(label: string, job: () => Promise<void>) {
    if (dataStatus !== "ready") return;
    syncQueue.push(label, job);
  }

  const userId = authUser?.$id ?? "";

  const selectedProject = data.projects.find(
    (project) => project.id === selectedProjectId,
  );
  // Das Insight-Panel zeigt ohne Auswahl das erste Projekt als Standard.
  const insightProject = selectedProject ?? data.projects[0];
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId);

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
    options?: { projectId?: string; taskId?: string; replace?: boolean },
  ) {
    setScreen(nextScreen);
    if (options?.projectId !== undefined) setSelectedProjectId(options.projectId);
    if (options?.taskId !== undefined) setSelectedTaskId(options.taskId);

    // Der Welcome-Screen ist bewusst nicht URL-adressierbar.
    if (typeof window === "undefined" || nextScreen === "welcome") return;

    const url = buildAppUrl({
      screen: nextScreen,
      projectId: options?.projectId ?? selectedProjectId ?? null,
      taskId: options?.taskId ?? selectedTaskId ?? null,
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

  async function handleProcessNote() {
    const trimmed = captureText.trim();
    if (!trimmed) return;

    setCaptureError(null);
    setIsProcessingNote(true);

    try {
      const result = await processRawNoteWithConfiguredAi({
        note: trimmed,
        modelId: data.settings.aiModel,
        projects: data.projects,
        locale,
      });
      setData((current) => ({
        ...current,
        rawNotes: [result.rawNote, ...current.rawNotes],
        suggestions: [...result.suggestions, ...current.suggestions],
      }));
      setActiveSuggestions(result.suggestions);
      setCaptureText("");
      persist(t("entity.rawNote"), () => upsertItem("rawNotes", result.rawNote, userId));
      for (const suggestion of result.suggestions) {
        persist(t("entity.suggestion"), () =>
          upsertItem("suggestions", suggestion, userId),
        );
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
    persist(t("entity.suggestion"), () => upsertItem("suggestions", updated, userId));
  }

  function acceptSuggestion(suggestion: AiSuggestion, createdBy: "ai" | "user" = "ai") {
    const now = new Date().toISOString();
    let projectId = suggestion.suggestedProjectId;
    let newProject: Project | null = null;

    if (!projectId) {
      projectId = `project-${Date.now().toString(36)}`;
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
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
    goTo("today", { projectId, taskId: task.id });

    if (newProject) {
      const projectToSave = newProject;
      persist(t("entity.projectNew"), () => upsertItem("projects", projectToSave, userId));
    }
    persist(t("entity.task"), () => upsertItem("tasks", task, userId));
    persist(t("entity.suggestion"), () =>
      upsertItem("suggestions", acceptedSuggestion, userId),
    );
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
    persist(t("entity.suggestion"), () => upsertItem("suggestions", rejected, userId));
  }

  function toggleTask(taskId: string) {
    const target = data.tasks.find((task) => task.id === taskId);
    if (!target) return;

    const updated: Task = {
      ...target,
      status: target.status === "done" ? "open" : "done",
      updatedAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updated : task)),
    }));
    persist(t("entity.task"), () => upsertItem("tasks", updated, userId));
  }

  function updateStoredTask(updated: Task) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === updated.id ? updated : task)),
    }));
    persist(t("entity.task"), () => upsertItem("tasks", updated, userId));
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
    persist(t("entity.task"), () => upsertItem("tasks", task, userId));
  }

  function restoreTasks(tasks: Task[]) {
    setData((current) => ({
      ...current,
      tasks: [...tasks, ...current.tasks],
    }));
    for (const task of tasks) {
      persist(t("entity.task"), () => upsertItem("tasks", task, userId));
    }
  }

  function restoreProject(project: Project, tasks: Task[]) {
    setData((current) => ({
      ...current,
      projects: [project, ...current.projects],
      tasks: [...tasks, ...current.tasks],
    }));
    persist(t("entity.project"), () => upsertItem("projects", project, userId));
    for (const task of tasks) {
      persist(t("entity.task"), () => upsertItem("tasks", task, userId));
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
    persist(t("entity.taskDelete"), () => deleteItem("tasks", taskId));

    if (target) {
      showUndo(t("undo.taskDeleted"), () => restoreTasks([target]));
    }
  }

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
    persist(t("entity.project"), () => upsertItem("projects", updated, userId));
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
    persist(t("entity.project"), () => upsertItem("projects", project, userId));
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
      persist(t("entity.taskDelete"), () => deleteItem("tasks", task.id));
    }
    persist(t("entity.projectDelete"), () => deleteItem("projects", projectId));

    if (targetProject) {
      showUndo(t("undo.projectDeleted"), () =>
        restoreProject(targetProject, projectTasks),
      );
    }
  }

  function createBlankProject() {
    const now = new Date().toISOString();
    setEditingProject({
      id: `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
      setAuthUser(user);
      setAuthStatus("signedIn");
      setDataStatus("loading");
      await loadRemoteData(user);
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

    setAuthUser(null);
    setAuthStatus("signedOut");
    setDataStatus("idle");
    setData(createEmptyAppData(locale));
    setActiveSuggestions([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setSearchQuery("");
    setUndo(null);
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
    goTo("today", { replace: true, projectId: "", taskId: "" });
    persist(t("entity.deleteAll"), () => deleteAllUserData());
  }

  function handleAiModelChange(aiModel: AiModelId) {
    const settings = { ...data.settings, aiModel };
    setData((current) => ({
      ...current,
      settings,
    }));
    persist(t("entity.settings"), () => saveSettings(settings));
  }

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    storeDeviceLocale(nextLocale);

    if (dataStatus === "ready") {
      const settings = { ...data.settings, locale: nextLocale };
      setData((current) => ({ ...current, settings }));
      persist(translate(nextLocale, "entity.settings"), () => saveSettings(settings));
    }
  }

  function handleThemeChange(preference: ThemePreference) {
    setThemePref(preference);
    storeTheme(preference);
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
          isProcessing={isProcessingNote}
          locale={locale}
          t={t}
          onBack={() => navigate("today")}
          onChangeText={setCaptureText}
          onAppendText={appendCaptureText}
          onProcess={handleProcessNote}
          onAccept={acceptSuggestion}
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
          onAccept={acceptSuggestion}
          onReject={rejectSuggestion}
          onOpenMore={() => navigate("more")}
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
          rawNote={data.rawNotes.find((note) => note.id === selectedTask.sourceNoteId)}
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
          rawNotes={data.rawNotes}
          projectById={projectById}
          locale={locale}
          t={t}
          onQueryChange={setSearchQuery}
          onBack={() => navigate("today")}
          onOpenTask={openTask}
          onOpenProject={openProject}
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
          {syncFailure ? (
            <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 md:mx-8">
              <p className="text-[12px] leading-5 text-[var(--red)]">
                {t("sync.failed", { label: syncFailure.label, detail: syncFailure.detail })}
              </p>
              <button
                type="button"
                onClick={() => syncQueue.retry()}
                className="shrink-0 rounded-[4px] bg-[var(--red)] px-3 py-1.5 text-[11px] font-bold text-white"
              >
                {t("common.retry")}
              </button>
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
