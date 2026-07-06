"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  CalendarPlus,
  CheckSquare2,
  ChevronRight,
  Circle,
  ClipboardList,
  Edit3,
  Flag,
  FolderKanban,
  Home,
  Inbox,
  Menu,
  Mic,
  Moon,
  MoreHorizontal,
  Plus,
  Sparkles,
  Square,
  Sun,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { ID, type Models } from "appwrite";
import { useEffect, useMemo, useRef, useState } from "react";
import { account, client } from "@/lib/appwrite";
import { processRawNoteWithConfiguredAi } from "@/lib/ai-client";
import { AI_MODEL_OPTIONS, MAX_NOTE_LENGTH, type AiModelId } from "@/lib/ai-models";
import { createEmptyAppData } from "@/lib/app-data";
import {
  deleteAllUserData,
  deleteItem,
  loadAppDataForUser,
  saveSettings,
  upsertItem,
} from "@/lib/appwrite-store";
import { formatDateLabel, isOverdue, toIsoDate } from "@/lib/date";
import {
  addEventToGoogleCalendar,
  addTaskToGoogleTasks,
  buildCalendarTemplateUrl,
  isGoogleConfigured,
  preloadGoogleIdentity,
} from "@/lib/google";
import {
  detectDeviceLocale,
  storeDeviceLocale,
  translate,
  type Locale,
  type MessageKey,
  type Translator,
} from "@/lib/i18n";
import {
  PRIORITY_COLORS,
  PROJECT_COLORS,
  pickProjectColor,
  withAlpha,
} from "@/lib/project-colors";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type ThemePreference,
} from "@/lib/theme";
import { createSyncQueue, type SyncFailure, type SyncStatus } from "@/lib/sync-queue";
import type {
  AiSuggestion,
  AppData,
  Project,
  RawNote,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type Screen = "welcome" | "today" | "capture" | "inbox" | "projects" | "project" | "task" | "more";
type TaskFilter = "all" | "today" | "planned" | "later";
type ProjectDetailTab = "tasks" | "details" | "notes";
type TaskDetailTab = "details" | "raw" | "ai";
type AuthMode = "login" | "register" | "recover";
type AuthStatus = "loading" | "signedOut" | "signedIn";
type DataStatus = "idle" | "loading" | "ready" | "error";

const priorityKeys: Record<TaskPriority, MessageKey> = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high",
};

const statusKeys: Record<TaskStatus, MessageKey> = {
  open: "status.open",
  in_progress: "status.in_progress",
  done: "status.done",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Minimale Typen für die Web Speech API (nicht Teil der TS-DOM-Typen).
type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = { isFinal: boolean; 0: SpeechAlternativeLike };
type SpeechResultListLike = { length: number; [index: number]: SpeechResultLike };
type SpeechEventLike = { resultIndex: number; results: SpeechResultListLike };
type SpeechErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;

  const candidates = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

  return candidates.SpeechRecognition ?? candidates.webkitSpeechRecognition ?? null;
}

const WELCOME_SEEN_KEY = "rote-agenda-welcome-done";

function hasSeenWelcome() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Ohne localStorage erscheint der Startbildschirm eben erneut.
  }
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
  // Der Startbildschirm erscheint nur beim allerersten Besuch; die Entscheidung
  // fällt clientseitig und wird nie serverseitig gerendert (Auth lädt zuerst).
  const [screen, setScreen] = useState<Screen>(() =>
    hasSeenWelcome() ? "today" : "welcome",
  );
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [projectTab, setProjectTab] = useState<ProjectDetailTab>("tasks");
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>("details");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [activeSuggestions, setActiveSuggestions] = useState<AiSuggestion[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
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

  const selectedProject =
    data.projects.find((project) => project.id === selectedProjectId) ??
    data.projects[0];
  const selectedTask =
    data.tasks.find((task) => task.id === selectedTaskId) ?? data.tasks[0];

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

  function navigate(nextScreen: Screen) {
    setScreen(nextScreen);
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setProjectTab("tasks");
    setScreen("project");
  }

  function openTask(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (task) {
      setSelectedTaskId(taskId);
      setSelectedProjectId(task.projectId);
      setTaskDetailTab("details");
      setScreen("task");
    }
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
    setSelectedTaskId(task.id);
    setSelectedProjectId(projectId);
    setScreen("today");

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

  function deleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
    setEditingTask(null);
    setScreen("today");
    persist(t("entity.taskDelete"), () => deleteItem("tasks", taskId));
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
    const taskIdsToDelete = data.tasks
      .filter((task) => task.projectId === projectId)
      .map((task) => task.id);

    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
    }));
    if (selectedProjectId === projectId) {
      setSelectedProjectId("");
    }
    setEditingProject(null);
    setScreen("projects");

    for (const taskId of taskIdsToDelete) {
      persist(t("entity.taskDelete"), () => deleteItem("tasks", taskId));
    }
    persist(t("entity.projectDelete"), () => deleteItem("projects", projectId));
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
    setScreen(hasSeenWelcome() ? "today" : "welcome");
  }

  function handleDeleteAllData() {
    setData((current) => ({
      ...createEmptyAppData(locale),
      user: current.user,
      settings: current.settings,
    }));
    setActiveSuggestions([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setScreen("today");
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
          modelLabel={aiModelLabel(data.settings.aiModel)}
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
            selectedProject={selectedProject}
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
    </main>
  );
}

function collectProjectNotes(data: AppData, projectId: string): RawNote[] {
  const noteIds = new Set(
    data.tasks
      .filter((task) => task.projectId === projectId && task.sourceNoteId)
      .map((task) => task.sourceNoteId),
  );

  for (const suggestion of data.suggestions) {
    if (suggestion.suggestedProjectId === projectId) {
      noteIds.add(suggestion.rawNoteId);
    }
  }

  return data.rawNotes.filter((note) => noteIds.has(note.id));
}

type AiStats = {
  processedNotes: number;
  acceptedCount: number;
  pendingCount: number;
};

function buildAiStats(data: AppData): AiStats {
  return {
    processedNotes: data.rawNotes.filter((note) => note.processed).length,
    acceptedCount: data.suggestions.filter((item) => item.state === "accepted").length,
    pendingCount: data.suggestions.filter((item) => item.state === "pending").length,
  };
}

function WorkSurface({
  children,
  hasBottomNav,
}: {
  children: React.ReactNode;
  hasBottomNav: boolean;
}) {
  return (
    <section className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[var(--paper-soft)] shadow-[0_18px_48px_rgb(31_24_14_/_10%)] md:min-h-[calc(100vh-48px)] md:max-w-none md:rounded-[14px] md:border md:border-[var(--line)] md:shadow-none">
      <div
        className={cx(
          "flex min-h-0 flex-1 flex-col pt-4 md:pt-0",
          hasBottomNav && "pb-[92px] md:pb-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function AppShellMessage({
  title,
  text,
  actionLabel,
  onAction,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Rote Agenda
        </p>
        <h1 className="mt-3 font-display text-[30px] font-bold">{title}</h1>
        <p className="mt-4 text-[14px] leading-7 text-[var(--muted)]">{text}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 w-full rounded-[5px] bg-[var(--green)] px-4 py-3 text-[13px] font-bold text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function AuthScreen({
  mode,
  error,
  notice,
  isSubmitting,
  locale,
  themePref,
  t,
  onLocaleChange,
  onThemeChange,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  locale: Locale;
  themePref: ThemePreference;
  t: Translator;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: { email: string; password: string; name: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const isRegister = mode === "register";
  const isRecover = mode === "recover";

  const title = isRecover
    ? t("auth.title.recover")
    : isRegister
      ? t("auth.title.register")
      : t("auth.title.login");
  const submitLabel = isRecover
    ? t("auth.submit.recover")
    : isRegister
      ? t("auth.submit.register")
      : t("auth.submit.login");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
            Rote Agenda
          </p>
          <div className="flex items-center gap-2">
            <LocaleSwitch locale={locale} onChange={onLocaleChange} />
            <ThemeToggleButton themePref={themePref} t={t} onChange={onThemeChange} />
          </div>
        </div>
        <h1 className="mt-3 font-display text-[34px] font-bold">{title}</h1>
        {isRecover ? (
          <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">
            {t("auth.recoverHint")}
          </p>
        ) : null}
        <form
          className="mt-7 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ email: email.trim(), password, name: name.trim() });
          }}
        >
          {isRegister ? (
            <Field label={t("auth.name")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
              />
            </Field>
          ) : null}
          <Field label={t("auth.email")}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
              required
            />
          </Field>
          {!isRecover ? (
            <Field label={t("auth.password")}>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none"
                minLength={8}
                required
              />
            </Field>
          ) : null}
          {error ? (
            <p className="rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--red)] px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? t("common.pleaseWait") : submitLabel}
          </button>
        </form>
        <div className="mt-5 flex flex-col items-start gap-2">
          {mode === "login" ? (
            <>
              <button
                type="button"
                onClick={() => onModeChange("register")}
                className="text-[12px] font-bold underline underline-offset-2"
              >
                {t("auth.toRegister")}
              </button>
              <button
                type="button"
                onClick={() => onModeChange("recover")}
                className="text-[12px] font-bold underline underline-offset-2"
              >
                {t("auth.toRecover")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className="text-[12px] font-bold underline underline-offset-2"
            >
              {isRegister ? t("auth.backToLogin.register") : t("auth.backToLogin.recover")}
            </button>
          )}
        </div>
        <LegalLinks t={t} className="mt-6" />
      </section>
    </main>
  );
}

function ThemeToggleButton({
  themePref,
  t,
  onChange,
}: {
  themePref: ThemePreference;
  t: Translator;
  onChange: (preference: ThemePreference) => void;
}) {
  // Wird nur clientseitig gerendert (nach dem Auth-Check), matchMedia ist daher sicher.
  const isDark =
    themePref === "dark" ||
    (themePref === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      type="button"
      onClick={() => onChange(isDark ? "light" : "dark")}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] border border-[var(--line)] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function LocaleSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="flex gap-1 text-[11px] font-bold">
      {(["de", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cx(
            "rounded-[4px] px-2 py-1 uppercase",
            locale === option
              ? "bg-[var(--green)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--surface-strong)]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function LegalLinks({ t, className }: { t: Translator; className?: string }) {
  return (
    <p className={cx("flex gap-4 text-[11px] text-[var(--muted)]", className)}>
      <Link href="/impressum" className="underline underline-offset-2">
        {t("legal.impressum")}
      </Link>
      <Link href="/datenschutz" className="underline underline-offset-2">
        {t("legal.datenschutz")}
      </Link>
    </p>
  );
}

function WelcomeScreen({ t, onStart }: { t: Translator; onStart: () => void }) {
  return (
    <div className="relative flex flex-1 overflow-hidden md:min-h-[calc(100vh-48px)]">
      <Image
        src="/welcome-movement.png"
        alt={t("welcome.imageAlt")}
        fill
        priority
        sizes="(max-width: 768px) 100vw, 62vw"
        className="object-cover object-left-bottom md:w-[58%] md:max-w-[720px]"
      />
      <div className="relative z-10 flex flex-1 flex-col px-8 pb-8 pt-[18vh] md:ml-[48%] md:max-w-[620px] md:px-12 md:pb-12 md:pt-24 lg:pt-32">
        <div className="ml-[35%] max-w-[230px] md:ml-0 md:max-w-none">
          <p className="hidden text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--red)] md:block">
            {t("welcome.kicker")}
          </p>
          <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--green)] md:mt-4 md:text-[64px] lg:text-[72px]">
            Rote Agenda
          </h1>
          <p className="mt-6 font-display text-[17px] font-bold leading-7 text-[var(--ink)] md:max-w-[430px] md:text-[23px] md:leading-9">
            {t("welcome.tagline")}
          </p>
          <div className="mt-8 h-0.5 w-10 bg-[var(--red)]" />
          <p className="mt-6 max-w-[210px] font-display text-[14px] italic leading-6 text-[var(--ink-soft)] md:max-w-[470px] md:text-[16px] md:leading-8">
            {t("welcome.motto")}
          </p>
          <p className="mt-5 hidden max-w-[500px] text-[14px] leading-7 text-[var(--muted)] md:block">
            {t("welcome.desc")}
          </p>
        </div>

        <div className="mt-auto space-y-6 md:max-w-sm">
          <button
            type="button"
            onClick={onStart}
            className="flex h-15 w-full items-center justify-between rounded-[6px] border border-white/70 bg-[var(--green)] px-8 font-display text-[16px] font-bold text-[var(--cream)] shadow-lg shadow-black/10 transition hover:bg-[var(--green-2)]"
          >
            <span>{t("welcome.start")}</span>
            <ChevronRight className="h-5 w-5" />
          </button>
          <LegalLinks
            t={t}
            className="justify-center text-[var(--cream)] md:justify-start md:text-[var(--muted)]"
          />
        </div>
      </div>
    </div>
  );
}

type TaskGroup = { project: Project | undefined; tasks: Task[] };

function TodayScreen({
  tasks,
  projects,
  filter,
  aiStats,
  locale,
  t,
  onFilterChange,
  onOpenTask,
  onOpenProject,
  onToggleTask,
  onCapture,
  onOpenInbox,
  onOpenMore,
}: {
  tasks: Task[];
  projects: Map<string, Project>;
  filter: TaskFilter;
  aiStats: AiStats;
  locale: Locale;
  t: Translator;
  onFilterChange: (filter: TaskFilter) => void;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCapture: () => void;
  onOpenInbox: () => void;
  onOpenMore: () => void;
}) {
  const isBrandNew = !tasks.length && !aiStats.processedNotes && filter === "all";

  // Aufgaben nach Projekt bündeln; Gruppen nach dringlichster offener
  // Aufgabe sortieren (Reihenfolge innerhalb der Gruppe bleibt erhalten).
  const groups = useMemo<TaskGroup[]>(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = byProject.get(task.projectId);
      if (list) {
        list.push(task);
      } else {
        byProject.set(task.projectId, [task]);
      }
    }

    const rankOf = (group: TaskGroup) => {
      const firstOpen = group.tasks.find((task) => task.status !== "done");
      if (!firstOpen) return "9999-99-99";
      return firstOpen.dueDate ?? "9999-99-98";
    };

    return Array.from(byProject.entries())
      .map(([projectId, groupTasks]) => ({
        project: projects.get(projectId),
        tasks: groupTasks,
      }))
      .sort(
        (a, b) =>
          rankOf(a).localeCompare(rankOf(b)) ||
          (a.project?.title ?? "").localeCompare(b.project?.title ?? ""),
      );
  }, [tasks, projects]);

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("today.title")}
        leftIcon={<Menu className="h-6 w-6" />}
        rightIcon={<Bell className="h-5 w-5" />}
        leftLabel={t("today.openMore")}
        rightLabel={t("today.openInbox")}
        onLeft={onOpenMore}
        onRight={onOpenInbox}
      />

      <button
        type="button"
        onClick={onCapture}
        className="mt-6 flex h-[68px] items-center justify-between rounded-[6px] bg-[var(--green)] p-3 pl-5 text-left text-[14px] font-medium text-white shadow-md shadow-black/10"
      >
        <span>{t("today.capturePrompt")}</span>
        <span className="grid h-11 w-11 place-items-center rounded-[4px] bg-[var(--red)]">
          <Plus className="h-6 w-6" />
        </span>
      </button>

      {aiStats.processedNotes ? (
        <button
          type="button"
          onClick={onOpenInbox}
          className="mt-5 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:bg-[var(--surface-strong)]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.03em]">
              <Sparkles className="h-4 w-4 text-[var(--green)]" />
              {t("today.aiUpdate")}
            </div>
            <ChevronRight className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[13px] font-bold">
            {t(
              aiStats.processedNotes === 1
                ? "today.notesProcessed.one"
                : "today.notesProcessed.many",
              { count: aiStats.processedNotes },
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <span>{t("today.accepted", { count: aiStats.acceptedCount })}</span>
            <span>{t("today.toReview", { count: aiStats.pendingCount })}</span>
          </div>
        </button>
      ) : null}

      <div className="mt-9 flex items-end justify-between">
        <h2 className="font-display text-[20px] font-bold">{t("today.myTasks")}</h2>
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className="text-[12px] font-semibold underline underline-offset-2"
        >
          {t("today.showAll")}
        </button>
      </div>

      <TaskTabs value={filter} t={t} onChange={onFilterChange} />

      <div className="mt-4 space-y-6">
        {tasks.length ? (
          groups.map((group) => {
            const project = group.project;
            const openCount = group.tasks.filter((task) => task.status !== "done").length;

            return (
              <section key={project?.id ?? "__none"}>
                <button
                  type="button"
                  onClick={project ? () => onOpenProject(project.id) : undefined}
                  disabled={!project}
                  className="flex w-full items-center gap-2 px-1 text-left disabled:cursor-default"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project?.color ?? "var(--line-strong)" }}
                  />
                  <span className="truncate font-display text-[15px] font-bold">
                    {project?.title ?? t("task.noProject")}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                    {t("projects.openCount", { count: openCount })}
                  </span>
                </button>
                <div className="mt-2 space-y-2">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={project}
                      locale={locale}
                      t={t}
                      hideProject
                      onOpen={() => onOpenTask(task.id)}
                      onToggle={() => onToggleTask(task.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : isBrandNew ? (
          <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
            <p className="font-display text-[18px] font-bold">{t("today.welcomeTitle")}</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
              {t("today.welcomeText")}
            </p>
            <button
              type="button"
              onClick={onCapture}
              className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              {t("today.captureFirst")}
            </button>
          </div>
        ) : (
          <EmptyState title={t("today.emptyTitle")} text={t("today.emptyText")} />
        )}
      </div>
    </div>
  );
}

function CaptureScreen({
  captureText,
  suggestions,
  projects,
  editingSuggestionId,
  modelLabel,
  error,
  isProcessing,
  locale,
  t,
  onBack,
  onChangeText,
  onAppendText,
  onProcess,
  onAccept,
  onReject,
  onEditSuggestion,
  onUpdateSuggestion,
}: {
  captureText: string;
  suggestions: AiSuggestion[];
  projects: Project[];
  editingSuggestionId: string | null;
  modelLabel: string;
  error: string | null;
  isProcessing: boolean;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onChangeText: (value: string) => void;
  onAppendText: (value: string) => void;
  onProcess: () => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  // Der Capture-Screen wird nie serverseitig gerendert,
  // daher ist die direkte Browser-Erkennung hydration-sicher.
  const [isMicSupported] = useState(() => Boolean(getSpeechRecognitionCtor()));
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) return;

    setMicError(null);
    const recognition = new RecognitionCtor();
    recognition.lang = locale === "de" ? "de-DE" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcripts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal) {
          const transcript = result[0]?.transcript.trim();
          if (transcript) transcripts.push(transcript);
        }
      }
      if (transcripts.length) onAppendText(transcripts.join(" "));
    };
    recognition.onerror = (event) => {
      setMicError(
        t(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "capture.mic.denied"
            : "capture.mic.error",
        ),
      );
      recognitionRef.current = null;
      setIsRecording(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsRecording(false);
      setMicError(t("capture.mic.error"));
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("capture.title")}
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        leftLabel={t("common.back")}
        onLeft={onBack}
        rightIcon={<Sparkles className="h-5 w-5" />}
      />

      <div className="mt-8 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4">
        <textarea
          value={captureText}
          onChange={(event) => onChangeText(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={t("capture.placeholder")}
          className="min-h-44 w-full resize-none bg-transparent text-[16px] leading-7 outline-none placeholder:text-[var(--muted)]"
        />
        {isMicSupported ? (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={isRecording ? t("capture.mic.stop") : t("capture.mic.start")}
              className={cx(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full transition",
                isRecording
                  ? "mic-recording bg-[var(--red)] text-white"
                  : "border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface-strong)]",
              )}
            >
              <Mic className="h-5 w-5" />
            </button>
            <span className="text-[12px] leading-5 text-[var(--muted)]">
              {isRecording ? t("capture.mic.listening") : t("capture.mic.start")}
            </span>
          </div>
        ) : null}
        {micError ? (
          <p className="mt-3 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--muted)]">
            {micError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onProcess}
          disabled={!captureText.trim() || isProcessing}
          className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--red)] px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-[var(--red-dark)] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isProcessing ? t("capture.processing") : t("capture.process", { model: modelLabel })}
        </button>
        {error ? (
          <p className="mt-3 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              projects={projects}
              isEditing={editingSuggestionId === suggestion.id}
              locale={locale}
              t={t}
              onAccept={() => onAccept(suggestion)}
              onCreateTask={() => onAccept(suggestion, "user")}
              onReject={() => onReject(suggestion.id)}
              onEdit={() => onEditSuggestion(suggestion.id)}
              onCancelEdit={() => onEditSuggestion(null)}
              onUpdate={(updated) => {
                onUpdateSuggestion(updated);
                onEditSuggestion(null);
              }}
            />
          ))
        ) : (
          <div className="rounded-[7px] border border-dashed border-[var(--line-strong)] p-5 text-[13px] leading-6 text-[var(--muted)]">
            {t("capture.examples")}
          </div>
        )}
      </div>
    </div>
  );
}

function InboxScreen({
  suggestions,
  projects,
  editingSuggestionId,
  locale,
  t,
  onEditSuggestion,
  onUpdateSuggestion,
  onAccept,
  onReject,
  onOpenMore,
}: {
  suggestions: AiSuggestion[];
  projects: Project[];
  editingSuggestionId: string | null;
  locale: Locale;
  t: Translator;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onOpenMore: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("inbox.title")}
        leftIcon={<Inbox className="h-5 w-5" />}
        rightIcon={<MoreHorizontal className="h-5 w-5" />}
        rightLabel={t("today.openMore")}
        onRight={onOpenMore}
      />
      <p className="mt-5 text-[13px] leading-6 text-[var(--muted)]">{t("inbox.hint")}</p>

      <div className="mt-6 space-y-4">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              projects={projects}
              isEditing={editingSuggestionId === suggestion.id}
              compact
              locale={locale}
              t={t}
              onAccept={() => onAccept(suggestion)}
              onCreateTask={() => onAccept(suggestion, "user")}
              onReject={() => onReject(suggestion.id)}
              onEdit={() => onEditSuggestion(suggestion.id)}
              onCancelEdit={() => onEditSuggestion(null)}
              onUpdate={(updated) => {
                onUpdateSuggestion(updated);
                onEditSuggestion(null);
              }}
            />
          ))
        ) : (
          <EmptyState title={t("inbox.emptyTitle")} text={t("inbox.emptyText")} />
        )}
      </div>
    </div>
  );
}

function ProjectsScreen({
  projects,
  tasks,
  locale,
  t,
  onOpenProject,
  onCreateProject,
}: {
  projects: Project[];
  tasks: Task[];
  locale: Locale;
  t: Translator;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("projects.title")}
        leftIcon={<FolderKanban className="h-5 w-5" />}
        rightIcon={<Plus className="h-5 w-5" />}
        rightLabel={t("projects.new")}
        onRight={onCreateProject}
      />
      {!projects.length ? (
        <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
          <p className="font-display text-[18px] font-bold">{t("projects.emptyTitle")}</p>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            {t("projects.emptyText")}
          </p>
          <button
            type="button"
            onClick={onCreateProject}
            className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            {t("projects.create")}
          </button>
        </div>
      ) : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {projects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const openTasks = projectTasks.filter((task) => task.status !== "done").length;
          const nextDeadline = projectTasks
            .map((task) => task.dueDate)
            .filter(Boolean)
            .sort()[0] as string | undefined;
          const progress = projectProgress(project, projectTasks);

          return (
            <button
              type="button"
              key={project.id}
              onClick={() => onOpenProject(project.id)}
              className="w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--surface-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-[20px] font-bold leading-7">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">
                    {project.description}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px] font-semibold">
                <span>{t("projects.openCount", { count: openTasks })}</span>
                <span>
                  {nextDeadline ? formatDateLabel(nextDeadline, locale) : t("projects.noDeadline")}
                </span>
              </div>
              <ProgressBar value={progress} className="mt-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectDetailScreen({
  project,
  tasks,
  notes,
  tab,
  locale,
  t,
  onBack,
  onTabChange,
  onOpenTask,
  onToggleTask,
  onAddTask,
  onToggleAi,
  onEdit,
}: {
  project: Project;
  tasks: Task[];
  notes: RawNote[];
  tab: ProjectDetailTab;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onTabChange: (tab: ProjectDetailTab) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: () => void;
  onToggleAi: () => void;
  onEdit: () => void;
}) {
  const progress = projectProgress(project, tasks);

  return (
    <div className="flex flex-1 flex-col pt-3 md:pt-8">
      <div className="px-6 md:px-8 lg:px-10">
        <ScreenHeader
          title=""
          leftIcon={<ArrowLeft className="h-5 w-5" />}
          rightIcon={<Edit3 className="h-5 w-5" />}
          leftLabel={t("common.back")}
          rightLabel={t("project.edit")}
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {t("project.kicker")}
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {project.title}
        </h1>
        <div className="mt-8 flex items-center justify-between text-[13px]">
          <span>{t("project.progress")}</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} className="mt-3" />
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as ProjectDetailTab)}
        tabs={["tasks", "details", "notes"]}
        labels={{
          tasks: t("project.tab.tasks"),
          details: t("project.tab.details"),
          notes: t("project.tab.notes"),
        }}
      />

      <div className="px-6 md:px-8 lg:px-10">
        {tab === "tasks" ? (
          <div className="divide-y divide-[var(--line)]">
            {tasks.map((task) => (
              <TaskLine
                key={task.id}
                task={task}
                locale={locale}
                onOpen={() => onOpenTask(task.id)}
                onToggle={() => onToggleTask(task.id)}
              />
            ))}
            <button
              type="button"
              onClick={onAddTask}
              className="mt-7 flex items-center gap-3 text-[14px] font-semibold text-[var(--red)]"
            >
              <Plus className="h-4 w-4" />
              {t("project.addTask")}
            </button>
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="space-y-5 pt-5">
            <p className="text-[14px] leading-7 text-[var(--ink-soft)]">
              {project.description}
            </p>
            <button
              type="button"
              onClick={onToggleAi}
              className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left"
            >
              <span>
                <span className="block text-[13px] font-bold">{t("project.aiToggle")}</span>
                <span className="text-[12px] text-[var(--muted)]">
                  {project.aiEnabled ? t("project.aiActive") : t("project.aiPaused")}
                </span>
              </span>
              <span
                className={cx(
                  "flex h-7 w-12 items-center rounded-full p-1 transition",
                  project.aiEnabled ? "bg-[var(--red)]" : "bg-[var(--line-strong)]",
                )}
              >
                <span
                  className={cx(
                    "h-5 w-5 rounded-full bg-white transition",
                    project.aiEnabled && "translate-x-5",
                  )}
                />
              </span>
            </button>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                {t("project.keywords")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-[12px]"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "notes" ? (
          notes.length ? (
            <div className="space-y-3 pt-5">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
                    {note.content}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                    {t("project.noteMeta", {
                      date: formatDateLabel(note.createdAt.slice(0, 10), locale),
                    })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-5 text-[14px] leading-7 text-[var(--muted)]">
              {t("project.notesEmpty")}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function TaskDetailScreen({
  task,
  project,
  rawNote,
  suggestion,
  tab,
  locale,
  t,
  onBack,
  onTabChange,
  onEdit,
  onToggleDone,
  onOpenProject,
}: {
  task: Task;
  project?: Project;
  rawNote?: { content: string } | undefined;
  suggestion?: AiSuggestion | undefined;
  tab: TaskDetailTab;
  locale: Locale;
  t: Translator;
  onBack: () => void;
  onTabChange: (tab: TaskDetailTab) => void;
  onEdit: () => void;
  onToggleDone: () => void;
  onOpenProject: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col pt-3 md:pt-8">
      <div className="px-6 md:px-8 lg:px-10">
        <ScreenHeader
          title=""
          leftIcon={<ArrowLeft className="h-5 w-5" />}
          rightIcon={<Edit3 className="h-5 w-5" />}
          leftLabel={t("common.back")}
          rightLabel={t("task.edit")}
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {project?.title ?? t("task.fallbackKicker")}
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {task.title}
        </h1>
        <div className="mt-7 grid grid-cols-2 gap-3 text-[12px]">
          <InfoTile label={t("task.status")} value={t(statusKeys[task.status])} />
          <InfoTile label={t("task.deadline")} value={formatDateLabel(task.dueDate, locale)} />
          <InfoTile label={t("task.priority")} value={t(priorityKeys[task.priority])} />
          <button
            type="button"
            onClick={onOpenProject}
            className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left"
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
              {t("task.project")}
            </span>
            <span className="mt-1 block font-bold">
              {project?.title ?? t("task.noProject")}
            </span>
          </button>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[14px] font-bold">
          <button
            type="button"
            onClick={onToggleDone}
            className="grid h-6 w-6 place-items-center text-[var(--red)]"
          >
            {task.status === "done" ? (
              <CheckSquare2 className="h-5 w-5" />
            ) : (
              <Square className="h-5 w-5" />
            )}
          </button>
          {t("task.done")}
        </label>
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as TaskDetailTab)}
        tabs={["details", "raw", "ai"]}
        labels={{
          details: t("task.tab.details"),
          raw: t("task.tab.raw"),
          ai: t("task.tab.ai"),
        }}
      />

      <div className="space-y-5 px-6 md:px-8 lg:px-10">
        {tab === "details" ? (
          <>
            <section>
              <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                {t("task.descriptionHeading")}
              </h2>
              <p className="mt-2 text-[14px] leading-7 text-[var(--ink-soft)]">
                {task.description || t("task.noDescription")}
              </p>
            </section>
            <GoogleSection key={task.id} task={task} t={t} />
          </>
        ) : null}
        {tab === "raw" ? (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              {t("task.rawHeading")}
            </h2>
            <p className="mt-2 rounded-[6px] bg-[var(--surface)] p-4 text-[13px] leading-6 text-[var(--muted)]">
              {rawNote?.content ?? t("task.manualCreated")}
            </p>
          </section>
        ) : null}
        {tab === "ai" ? (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              {t("task.aiHeading")}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
              {suggestion?.reasoning ?? t("task.noAi")}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function GoogleSection({ task, t }: { task: Task; t: Translator }) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const hasDate = Boolean(task.dueDate);

  useEffect(() => {
    void preloadGoogleIdentity().catch(() => undefined);
  }, []);

  async function handleTransfer() {
    setError(null);

    // Ohne Client-ID öffnet der Kalender-Weg die offizielle Vorbefüll-Seite.
    if (hasDate && !isGoogleConfigured) {
      window.open(
        buildCalendarTemplateUrl({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate as string,
        }),
        "_blank",
        "noopener",
      );
      return;
    }

    setState("working");
    try {
      if (hasDate) {
        await addEventToGoogleCalendar({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate as string,
        });
      } else {
        await addTaskToGoogleTasks({
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
        });
      }
      setState("done");
    } catch (transferError) {
      setState("idle");
      setError(
        t("google.error", {
          detail:
            transferError instanceof Error && transferError.message
              ? transferError.message
              : "?",
        }),
      );
    }
  }

  return (
    <section>
      <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        Google
      </h2>
      {!hasDate && !isGoogleConfigured ? (
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          {t("google.tasksNotConfigured")}
        </p>
      ) : state === "done" ? (
        <p className="mt-2 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px] font-bold text-[var(--green-2)]">
          {hasDate ? t("google.doneCalendar") : t("google.doneTasks")}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleTransfer()}
          disabled={state === "working"}
          className="mt-2 flex items-center gap-2 rounded-[5px] border border-[var(--line-strong)] px-4 py-3 text-[13px] font-bold disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" />
          {state === "working"
            ? t("google.working")
            : hasDate
              ? t("google.addToCalendar")
              : t("google.addToTasks")}
        </button>
      )}
      {error ? (
        <p className="mt-2 rounded-[5px] border border-[var(--red)] bg-[var(--surface-strong)] p-3 text-[12px] leading-5 text-[var(--red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MoreScreen({
  userName,
  userEmail,
  aiModel,
  locale,
  themePref,
  syncStatus,
  t,
  onAiModelChange,
  onLocaleChange,
  onThemeChange,
  onDeleteAll,
  onLogout,
}: {
  userName: string;
  userEmail: string;
  aiModel: AiModelId;
  locale: Locale;
  themePref: ThemePreference;
  syncStatus: SyncStatus;
  t: Translator;
  onAiModelChange: (model: AiModelId) => void;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onDeleteAll: () => void;
  onLogout: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const syncLabel =
    syncStatus === "saving"
      ? t("more.sync.saving")
      : syncStatus === "error"
        ? t("more.sync.error")
        : t("more.sync.ok");

  const selectClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] font-bold outline-none";
  const labelClass =
    "mb-2 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]";

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader title={t("more.title")} leftIcon={<MoreHorizontal className="h-5 w-5" />} />
      <div className="mt-8 space-y-3">
        <InfoTile label={t("more.product")} value={t("more.productValue")} />
        <InfoTile label={t("more.account")} value={userName || userEmail} />
        <InfoTile label={t("more.storage")} value={syncLabel} />
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="block">
            <span className={labelClass}>{t("more.aiModel")}</span>
            <select
              value={aiModel}
              onChange={(event) => onAiModelChange(event.target.value as AiModelId)}
              className={selectClass}
            >
              {AI_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="block">
            <span className={labelClass}>{t("more.language")}</span>
            <select
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as Locale)}
              className={selectClass}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>
        <section className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <span className={labelClass}>{t("more.theme")}</span>
          <div className="grid grid-cols-3 gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--field)] p-1">
            {(["system", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onThemeChange(option)}
                aria-pressed={themePref === option}
                className={cx(
                  "rounded-[4px] px-2 py-2 text-[12px] font-bold transition",
                  themePref === option
                    ? "bg-[var(--green)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {t(`theme.${option}`)}
              </button>
            ))}
          </div>
        </section>
        {confirmingDelete ? (
          <div className="rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              {t("more.deleteAllTitle")}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              {t("more.deleteAllText")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDeleteAll();
                }}
                className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
              >
                {t("more.deleteAllYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold text-[var(--red)]"
          >
            {t("more.deleteAll")}
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold"
        >
          {t("more.logout")}
          <X className="h-4 w-4" />
        </button>
        <LegalLinks t={t} className="pt-2" />
      </div>
    </div>
  );
}

function ScreenHeader({
  title,
  leftIcon,
  rightIcon,
  leftLabel,
  rightLabel,
  onLeft,
  onRight,
}: {
  title: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  onLeft?: () => void;
  onRight?: () => void;
}) {
  const leftSlotClass = "grid h-10 w-10 place-items-center text-[var(--ink)]";
  const rightSlotClass = `${leftSlotClass} justify-self-end`;

  function renderSlot(
    icon: React.ReactNode,
    onClick: (() => void) | undefined,
    className: string,
    label?: string,
  ) {
    if (!icon) {
      return <span className={className} aria-hidden="true" />;
    }

    if (!onClick) {
      return (
        <span className={className} aria-hidden="true">
          {icon}
        </span>
      );
    }

    return (
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        {icon}
      </button>
    );
  }

  return (
    <header className="grid h-10 grid-cols-[44px_1fr_44px] items-center">
      {renderSlot(leftIcon, onLeft, leftSlotClass, leftLabel)}
      <h1 className="font-display text-[25px] font-bold leading-none">{title}</h1>
      {renderSlot(rightIcon, onRight, rightSlotClass, rightLabel)}
    </header>
  );
}

function TaskTabs({
  value,
  t,
  onChange,
}: {
  value: TaskFilter;
  t: Translator;
  onChange: (filter: TaskFilter) => void;
}) {
  const tabs: Array<{ value: TaskFilter; label: string }> = [
    { value: "all", label: t("filter.all") },
    { value: "today", label: t("filter.today") },
    { value: "planned", label: t("filter.planned") },
    { value: "later", label: t("filter.later") },
  ];

  return (
    <div className="mt-6 grid grid-cols-4 border-b border-[var(--line)] text-[14px] font-medium">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            "relative h-10",
            value === tab.value && "font-bold text-[var(--ink)]",
          )}
        >
          {tab.label}
          {value === tab.value ? (
            <span className="absolute inset-x-2 bottom-[-1px] h-0.5 bg-[var(--red)]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function DetailTabs({
  value,
  onChange,
  tabs,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: string[];
  labels: Record<string, string>;
}) {
  return (
    <div className="mt-8 grid grid-cols-3 border-y border-[var(--line)] text-[14px] font-medium">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab}
          onClick={() => onChange(tab)}
          className={cx("relative h-14", value === tab && "font-bold")}
        >
          {labels[tab]}
          {value === tab ? (
            <span className="absolute inset-x-6 bottom-[-1px] h-0.5 bg-[var(--red)]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  project,
  locale,
  t,
  hideProject,
  onOpen,
  onToggle,
}: {
  task: Task;
  project?: Project;
  locale: Locale;
  t: Translator;
  hideProject?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const overdue = task.status !== "done" && isOverdue(task.dueDate);
  // Weiche Projektfarbe als Zeilenhintergrund; erledigte Aufgaben blasser.
  const tint = withAlpha(project?.color, task.status === "done" ? 0.08 : 0.16);

  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-[7px] px-3 py-3",
        hideProject ? "min-h-[52px]" : "min-h-[66px]",
      )}
      style={tint ? { backgroundColor: tint } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid h-8 w-8 shrink-0 place-items-center text-[var(--red)]"
      >
        {task.status === "done" ? (
          <CheckSquare2 className="h-5 w-5 fill-[var(--red)] text-white" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            title={t(priorityKeys[task.priority])}
            aria-label={t(priorityKeys[task.priority])}
          />
          <span
            className={cx(
              "truncate text-[14px] font-semibold",
              task.status === "done" && "text-[var(--muted)] line-through",
            )}
          >
            {task.title}
          </span>
          {task.priority === "high" && task.status !== "done" ? (
            <Flag className="h-3.5 w-3.5 shrink-0 fill-[var(--red)] text-[var(--red)]" />
          ) : null}
        </p>
        {!hideProject ? (
          <p className="mt-1 truncate pl-4 text-[12px] text-[var(--muted)]">
            {project?.title ?? t("task.noProject")}
          </p>
        ) : null}
      </button>
      <span
        className={cx(
          "shrink-0 text-[12px]",
          overdue ? "font-bold text-[var(--red)]" : "text-[var(--ink-soft)]",
        )}
      >
        {overdue ? `${t("task.overdue")} · ` : ""}
        {formatDateLabel(task.dueDate, locale)}
      </span>
    </div>
  );
}

function TaskLine({
  task,
  locale,
  onOpen,
  onToggle,
}: {
  task: Task;
  locale: Locale;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[62px] items-center gap-3 py-3">
      <button type="button" onClick={onToggle} className="text-[var(--red)]">
        {task.status === "done" ? (
          <CheckSquare2 className="h-5 w-5 fill-[var(--red)] text-white" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-medium">{task.title}</span>
      </button>
      <span className="text-[12px] text-[var(--ink-soft)]">
        {formatDateLabel(task.dueDate, locale)}
      </span>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  projects,
  isEditing,
  compact,
  locale,
  t,
  onAccept,
  onCreateTask,
  onReject,
  onEdit,
  onCancelEdit,
  onUpdate,
}: {
  suggestion: AiSuggestion;
  projects: Project[];
  isEditing: boolean;
  compact?: boolean;
  locale: Locale;
  t: Translator;
  onAccept: () => void;
  onCreateTask: () => void;
  onReject: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (suggestion: AiSuggestion) => void;
}) {
  const project = projects.find((item) => item.id === suggestion.suggestedProjectId);

  if (suggestion.state !== "pending") {
    return (
      <div className="rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-bold text-[var(--muted)]">
        {suggestion.state === "accepted" ? t("sugg.accepted") : t("sugg.rejected")}
      </div>
    );
  }

  if (isEditing) {
    return (
      <SuggestionEditor
        suggestion={suggestion}
        projects={projects}
        t={t}
        onCancel={onCancelEdit}
        onSave={onUpdate}
      />
    );
  }

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[var(--red)]">
            {t(suggestionStatusKey(suggestion))}
          </p>
          <h2 className="mt-2 font-display text-[20px] font-bold leading-7">
            {suggestion.suggestedTitle}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--green)] px-2.5 py-1 text-[11px] font-bold text-white">
          {Math.round(suggestion.confidence * 100)}%
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
        <InfoTile
          label={t("sugg.project")}
          value={project?.title ?? suggestion.suggestedNewProjectTitle ?? t("sugg.unclear")}
        />
        <InfoTile label={t("sugg.deadline")} value={formatDateLabel(suggestion.dueDate, locale)} />
        <InfoTile label={t("sugg.priority")} value={t(priorityKeys[suggestion.priority])} />
        <InfoTile label={t("sugg.source")} value={t("sugg.sourceValue")} />
      </dl>

      {!compact ? (
        <p className="mt-4 text-[12px] leading-5 text-[var(--muted)]">
          {suggestion.reasoning}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
        >
          {t("sugg.accept")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("sugg.edit")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("sugg.reassign")}
        </button>
        <button
          type="button"
          onClick={onCreateTask}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("sugg.createTask")}
        </button>
      </div>
      <button
        type="button"
        onClick={onReject}
        className="mt-3 text-[12px] font-bold text-[var(--muted)] underline underline-offset-2"
      >
        {t("sugg.ignore")}
      </button>
    </article>
  );
}

function SuggestionEditor({
  suggestion,
  projects,
  t,
  onCancel,
  onSave,
}: {
  suggestion: AiSuggestion;
  projects: Project[];
  t: Translator;
  onCancel: () => void;
  onSave: (suggestion: AiSuggestion) => void;
}) {
  const [draft, setDraft] = useState(suggestion);
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 shadow-sm">
      <div className="space-y-3">
        <Field label={t("sugg.taskLabel")}>
          <input
            value={draft.suggestedTitle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, suggestedTitle: event.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("sugg.project")}>
          <select
            value={draft.suggestedProjectId ?? "__new"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                suggestedProjectId: event.target.value === "__new" ? null : event.target.value,
                suggestedNewProjectTitle:
                  event.target.value === "__new"
                    ? current.suggestedNewProjectTitle ?? t("sugg.newProjectLabel")
                    : null,
              }))
            }
            className={inputClass}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
            <option value="__new">{t("sugg.proposeNew")}</option>
          </select>
        </Field>
        {!draft.suggestedProjectId ? (
          <Field label={t("sugg.newProjectLabel")}>
            <input
              value={draft.suggestedNewProjectTitle ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  suggestedNewProjectTitle: event.target.value,
                }))
              }
              className={inputClass}
            />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("sugg.deadline")}>
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueDate: event.target.value || null,
                }))
              }
              className={inputClass}
            />
          </Field>
          <Field label={t("sugg.priority")}>
            <select
              value={draft.priority}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priority: event.target.value as TaskPriority,
                }))
              }
              className={inputClass}
            >
              <option value="low">{t("priority.low")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="high">{t("priority.high")}</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          {t("common.cancel")}
        </button>
      </div>
    </article>
  );
}

function TaskEditor({
  task,
  projects,
  t,
  onClose,
  onDelete,
  onSave,
}: {
  task: Task;
  projects: Project[];
  t: Translator;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState(task);
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";
  const smallInputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-2 text-[12px] outline-none";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">{t("taskEditor.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field label={t("editor.titleLabel")}>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label={t("editor.description")}>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-24 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label={t("editor.project")}>
            <select
              value={draft.projectId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, projectId: event.target.value }))
              }
              className={inputClass}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("editor.status")}>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TaskStatus,
                  }))
                }
                className={smallInputClass}
              >
                <option value="open">{t("status.open")}</option>
                <option value="in_progress">{t("status.in_progress")}</option>
                <option value="done">{t("status.done")}</option>
              </select>
            </Field>
            <Field label={t("editor.priority")}>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
                className={smallInputClass}
              >
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </select>
            </Field>
            <Field label={t("editor.deadline")}>
              <input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dueDate: event.target.value || null }))
                }
                className={smallInputClass}
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}
            disabled={!draft.title.trim()}
            className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectEditor({
  project,
  isNew,
  taskCount,
  t,
  onClose,
  onDelete,
  onSave,
}: {
  project: Project;
  isNew: boolean;
  taskCount: number;
  t: Translator;
  onClose: () => void;
  onDelete: (projectId: string) => void;
  onSave: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [keywordsText, setKeywordsText] = useState(project.keywords.join(", "));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputClass =
    "h-11 w-full rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 text-[13px] outline-none";

  function parseKeywords(value: string) {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 12);
  }

  const deleteConfirmKey: MessageKey =
    taskCount === 0
      ? "projectEditor.deleteConfirm.none"
      : taskCount === 1
        ? "projectEditor.deleteConfirm.one"
        : "projectEditor.deleteConfirm.many";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">
            {isNew ? t("projectEditor.createTitle") : t("projectEditor.editTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field label={t("editor.titleLabel")}>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label={t("editor.description")}>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-20 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label={t("projectEditor.keywords")}>
            <input
              value={keywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              placeholder={t("projectEditor.keywordsPlaceholder")}
              className={inputClass}
            />
          </Field>
          <Field label={t("projectEditor.color")}>
            <div className="flex flex-wrap gap-2 pt-1">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  className={cx(
                    "h-8 w-8 rounded-full border border-black/10 transition",
                    draft.color === color &&
                      "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--paper-soft)]",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </Field>
          <label className="flex items-center justify-between rounded-[5px] border border-[var(--line)] bg-[var(--field)] px-3 py-3 text-[13px] font-bold">
            {t("projectEditor.aiLabel")}
            <input
              type="checkbox"
              checked={draft.aiEnabled}
              onChange={(event) =>
                setDraft((current) => ({ ...current, aiEnabled: event.target.checked }))
              }
              className="h-4 w-4 accent-[var(--red)]"
            />
          </label>
        </div>
        {confirmingDelete ? (
          <div className="mt-5 rounded-[6px] border border-[var(--red)] bg-[var(--surface-strong)] p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              {t(deleteConfirmKey, { count: taskCount })}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
              >
                {t("projectEditor.confirmYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...draft,
                  title: draft.title.trim(),
                  keywords: parseKeywords(keywordsText),
                  updatedAt: new Date().toISOString(),
                })
              }
              disabled={!draft.title.trim()}
              className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {t("common.save")}
            </button>
            {!isNew ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
              >
                {t("common.delete")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function BottomNav({
  screen,
  pendingCount,
  t,
  onNavigate,
}: {
  screen: Screen;
  pendingCount: number;
  t: Translator;
  onNavigate: (screen: Screen) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: t("nav.today"), icon: Home },
    { screen: "projects" as Screen, label: t("nav.projects"), icon: ClipboardList },
    { screen: "inbox" as Screen, label: t("nav.inbox"), icon: Inbox, count: pendingCount },
    { screen: "more" as Screen, label: t("nav.more"), icon: MoreHorizontal },
  ];

  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 h-[92px] bg-[var(--green)] px-5 pt-4 text-white shadow-[0_-18px_40px_rgb(0_0_0_/_14%)] md:hidden">
      <div className="grid grid-cols-[1fr_1fr_76px_1fr_1fr] items-start text-[10px] font-semibold">
        {items.slice(0, 2).map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onNavigate={onNavigate} />
        ))}
        <button
          type="button"
          onClick={() => onNavigate("capture")}
          className="mx-auto -mt-3 grid h-[62px] w-[62px] place-items-center rounded-full bg-[var(--red)] text-white shadow-lg shadow-black/25"
          aria-label={t("nav.capture")}
        >
          <Plus className="h-9 w-9" />
        </button>
        {items.slice(2).map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: { screen: Screen; label: string; icon: React.ElementType; count?: number };
  active: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.screen)}
      className={cx("relative flex flex-col items-center gap-1", active ? "text-[var(--red)]" : "text-white")}
    >
      <Icon className={cx("h-5 w-5", active && "fill-[var(--red)]")} />
      <span>{item.label}</span>
      {item.count ? (
        <span className="absolute right-3 top-[-5px] grid h-4 min-w-4 place-items-center rounded-full bg-[var(--red)] px-1 text-[9px] text-white">
          {item.count}
        </span>
      ) : null}
    </button>
  );
}

function DesktopSidebar({
  screen,
  pendingCount,
  themePref,
  t,
  onNavigate,
  onThemeChange,
}: {
  screen: Screen;
  pendingCount: number;
  themePref: ThemePreference;
  t: Translator;
  onNavigate: (screen: Screen) => void;
  onThemeChange: (preference: ThemePreference) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: t("nav.today"), icon: Home },
    { screen: "projects" as Screen, label: t("nav.projects"), icon: ClipboardList },
    {
      screen: "inbox" as Screen,
      label: `${t("nav.inbox")}${pendingCount ? ` (${pendingCount})` : ""}`,
      icon: Inbox,
    },
    { screen: "more" as Screen, label: t("nav.more"), icon: MoreHorizontal },
  ];

  return (
    <aside className="sticky top-6 hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 md:block">
      <div className="px-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[24px] font-bold">Rote Agenda</p>
          <ThemeToggleButton themePref={themePref} t={t} onChange={onThemeChange} />
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
          {t("welcome.tagline")}
        </p>
      </div>
      <div className="mt-6 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            screen === item.screen ||
            (screen === "project" && item.screen === "projects") ||
            (screen === "task" && item.screen === "today");
          return (
            <button
              type="button"
              key={item.screen}
              onClick={() => onNavigate(item.screen)}
              className={cx(
                "flex w-full items-center gap-3 rounded-[6px] px-3 py-3 text-left text-[13px] font-bold",
                active ? "bg-[var(--green)] text-white" : "hover:bg-[var(--surface-strong)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onNavigate("capture")}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        {t("nav.captureButton")}
      </button>
    </aside>
  );
}

function DesktopInsightPanel({
  data,
  selectedProject,
  t,
  onCapture,
  onOpenInbox,
}: {
  data: AppData;
  selectedProject?: Project;
  t: Translator;
  onCapture: () => void;
  onOpenInbox: () => void;
}) {
  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const pending = data.suggestions.filter((suggestion) => suggestion.state === "pending");
  const projectTasks = selectedProject
    ? data.tasks.filter((task) => task.projectId === selectedProject.id)
    : [];

  return (
    <aside className="sticky top-6 hidden space-y-4 md:block">
      <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {t("insight.focus")}
        </p>
        <h2 className="mt-3 font-display text-[26px] font-bold">
          {t(openTasks.length === 1 ? "insight.openTasks.one" : "insight.openTasks.many", {
            count: openTasks.length,
          })}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          {t("insight.philosophy")}
        </p>
        <button
          type="button"
          onClick={onCapture}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--green)] px-4 py-3 text-[13px] font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          {t("insight.newNote")}
        </button>
      </section>

      {selectedProject ? (
        <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
                {t("insight.activeProject")}
              </p>
              <h2 className="mt-3 font-display text-[23px] font-bold">
                {selectedProject.title}
              </h2>
            </div>
            <Tags className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <ProgressBar value={projectProgress(selectedProject, projectTasks)} className="mt-5" />
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            {t(
              projectTasks.filter((task) => task.status !== "done").length === 1
                ? "insight.openTasks.one"
                : "insight.openTasks.many",
              { count: projectTasks.filter((task) => task.status !== "done").length },
            )}
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onOpenInbox}
        className="flex w-full items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left"
      >
        <span>
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
            {t("insight.aiReview")}
          </span>
          <span className="mt-2 block font-display text-[22px] font-bold">
            {t(pending.length === 1 ? "insight.pending.one" : "insight.pending.many", {
              count: pending.length,
            })}
          </span>
        </span>
        <ChevronRight className="h-5 w-5" />
      </button>
    </aside>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-[var(--track)]", className)}>
      <div
        className="h-full rounded-full bg-[var(--red)] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-[12px] font-bold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
      <p className="font-display text-[18px] font-bold">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function suggestionStatusKey(suggestion: AiSuggestion): MessageKey {
  if (suggestion.suggestedNewProjectTitle) return "sugg.status.newProject";
  if (suggestion.needsReview) return "sugg.status.review";
  if (suggestion.confidence < 0.75) return "sugg.status.unsure";
  return "sugg.status.confident";
}

function projectProgress(project: Project, tasks: Task[]) {
  if (!tasks.length) return project.progress;
  const done = tasks.filter((task) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

function readErrorMessage(error: unknown, t: Translator) {
  if (error instanceof Error && error.message) return error.message;
  return t("error.unexpected");
}

function aiModelLabel(model: AiModelId) {
  return AI_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model;
}
