"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
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
  MoreHorizontal,
  Plus,
  Sparkles,
  Square,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { ID, type Models } from "appwrite";
import { useEffect, useMemo, useState } from "react";
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
import { createSyncQueue, type SyncStatus } from "@/lib/sync-queue";
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

const priorityLabels: Record<TaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
};

const statusLabels: Record<TaskStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  done: "Erledigt",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function RoteAgendaApp() {
  const [data, setData] = useState<AppData>(() => createEmptyAppData());
  const [authUser, setAuthUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("welcome");
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

  const syncQueue = useMemo(
    () =>
      createSyncQueue((status, error) => {
        setSyncStatus(status);
        setSyncError(error);
      }),
    [],
  );

  useEffect(() => {
    let isActive = true;

    async function boot() {
      void client.ping().catch(() => undefined);

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
  }, []);

  async function loadRemoteData(user: Models.User<Models.Preferences>) {
    try {
      const remoteData = await loadAppDataForUser(user);
      setData(remoteData);
      setDataError(null);
      setDataStatus("ready");
    } catch (error) {
      setDataError(readErrorMessage(error));
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
      });
      setData((current) => ({
        ...current,
        rawNotes: [result.rawNote, ...current.rawNotes],
        suggestions: [...result.suggestions, ...current.suggestions],
      }));
      setActiveSuggestions(result.suggestions);
      setCaptureText("");
      persist("Rohnotiz", () => upsertItem("rawNotes", result.rawNote, userId));
      for (const suggestion of result.suggestions) {
        persist("KI-Vorschlag", () => upsertItem("suggestions", suggestion, userId));
      }
    } catch (error) {
      setCaptureError(readErrorMessage(error));
    } finally {
      setIsProcessingNote(false);
    }
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
    persist("KI-Vorschlag", () => upsertItem("suggestions", updated, userId));
  }

  function acceptSuggestion(suggestion: AiSuggestion, createdBy: "ai" | "user" = "ai") {
    const now = new Date().toISOString();
    let projectId = suggestion.suggestedProjectId;
    let newProject: Project | null = null;

    if (!projectId) {
      projectId = `project-${Date.now().toString(36)}`;
      newProject = {
        id: projectId,
        title: suggestion.suggestedNewProjectTitle ?? "Neues Projekt",
        description: "Von Rote Agenda aus einer Rohnotiz vorgeschlagen.",
        keywords: suggestion.suggestedTitle
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 4)
          .slice(0, 6),
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
      persist("Neues Projekt", () => upsertItem("projects", projectToSave, userId));
    }
    persist("Aufgabe", () => upsertItem("tasks", task, userId));
    persist("KI-Vorschlag", () => upsertItem("suggestions", acceptedSuggestion, userId));
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
    persist("KI-Vorschlag", () => upsertItem("suggestions", rejected, userId));
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
    persist("Aufgabe", () => upsertItem("tasks", updated, userId));
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
    persist("Aufgabe", () => upsertItem("tasks", task, userId));
  }

  function deleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
    setEditingTask(null);
    setScreen("today");
    persist("Aufgabe löschen", () => deleteItem("tasks", taskId));
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
    persist("Projekt", () => upsertItem("projects", updated, userId));
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
    persist("Projekt", () => upsertItem("projects", project, userId));
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
      persist("Aufgabe löschen", () => deleteItem("tasks", taskId));
    }
    persist("Projekt löschen", () => deleteItem("projects", projectId));
  }

  function createBlankProject() {
    const now = new Date().toISOString();
    setEditingProject({
      id: `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: "",
      description: "",
      keywords: [],
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
    setAuthNotice(null);
    setIsAuthSubmitting(true);

    try {
      if (authMode === "recover") {
        await account.createRecovery({
          email,
          url: `${window.location.origin}/reset-password`,
        });
        setAuthNotice(
          "E-Mail verschickt. Öffne den Link aus der Nachricht, um ein neues Passwort zu setzen.",
        );
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
      setAuthError(readErrorMessage(error));
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
    setData(createEmptyAppData());
    setActiveSuggestions([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setScreen("welcome");
  }

  function handleDeleteAllData() {
    setData((current) => ({
      ...createEmptyAppData(),
      user: current.user,
      settings: current.settings,
    }));
    setActiveSuggestions([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setScreen("today");
    persist("Alle Daten löschen", () => deleteAllUserData());
  }

  function handleAiModelChange(aiModel: AiModelId) {
    const settings = { ...data.settings, aiModel };
    setData((current) => ({
      ...current,
      settings,
    }));
    persist("Einstellungen", () => saveSettings(settings));
  }

  if (authStatus === "loading") {
    return <AppShellMessage title="Rote Agenda" text="Appwrite-Sitzung wird geprüft." />;
  }

  if (authStatus === "signedOut") {
    return (
      <AuthScreen
        mode={authMode}
        error={authError}
        notice={authNotice}
        isSubmitting={isAuthSubmitting}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthError(null);
          setAuthNotice(null);
        }}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (dataStatus === "loading") {
    return <AppShellMessage title="Rote Agenda" text="Daten werden aus Appwrite geladen." />;
  }

  if (dataStatus === "error") {
    return (
      <AppShellMessage
        title="Appwrite Setup"
        text={dataError ?? "Die Appwrite-Daten konnten nicht geladen werden."}
        actionLabel="Abmelden"
        onAction={handleLogout}
      />
    );
  }

  const screenContent = (() => {
    if (screen === "welcome") {
      return <WelcomeScreen onStart={() => navigate("today")} />;
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
          onBack={() => navigate("today")}
          onChangeText={setCaptureText}
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
          syncStatus={syncStatus}
          onAiModelChange={handleAiModelChange}
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
        onFilterChange={setTaskFilter}
        onOpenTask={openTask}
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
            onNavigate={navigate}
          />
        ) : null}

        <WorkSurface hasBottomNav={screen !== "welcome"}>
          {syncError ? (
            <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-[6px] border border-[var(--red)] bg-white/80 p-3 md:mx-8">
              <p className="text-[12px] leading-5 text-[var(--red)]">{syncError}</p>
              <button
                type="button"
                onClick={() => syncQueue.retry()}
                className="shrink-0 rounded-[4px] bg-[var(--red)] px-3 py-1.5 text-[11px] font-bold text-white"
              >
                Erneut versuchen
              </button>
            </div>
          ) : null}
          {screenContent}
          {screen !== "welcome" ? (
            <BottomNav
              screen={screen}
              pendingCount={pendingSuggestions.length}
              onNavigate={navigate}
            />
          ) : null}
        </WorkSurface>

        {screen !== "welcome" ? (
          <DesktopInsightPanel
            data={data}
            selectedProject={selectedProject}
            onCapture={() => navigate("capture")}
            onOpenInbox={() => navigate("inbox")}
          />
        ) : null}
      </div>

      {editingTask ? (
        <TaskEditor
          task={editingTask}
          projects={data.projects}
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
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: { email: string; password: string; name: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const isRegister = mode === "register";
  const isRecover = mode === "recover";

  const title = isRecover
    ? "Passwort zurücksetzen"
    : isRegister
      ? "Account erstellen"
      : "Anmelden";
  const submitLabel = isRecover
    ? "Link anfordern"
    : isRegister
      ? "Registrieren"
      : "Anmelden";

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-[430px] rounded-[8px] border border-[var(--line)] bg-[var(--paper-soft)] p-7 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Rote Agenda
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold">{title}</h1>
        {isRecover ? (
          <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">
            Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.
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
            <Field label="Name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
              />
            </Field>
          ) : null}
          <Field label="E-Mail">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
              required
            />
          </Field>
          {!isRecover ? (
            <Field label="Passwort">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
                minLength={8}
                required
              />
            </Field>
          ) : null}
          {error ? (
            <p className="rounded-[5px] border border-[var(--red)] bg-white/70 p-3 text-[12px] leading-5 text-[var(--red)]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-[5px] border border-[var(--line-strong)] bg-white/70 p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-[5px] bg-[var(--red)] px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? "Bitte warten..." : submitLabel}
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
                Noch kein Account? Registrieren
              </button>
              <button
                type="button"
                onClick={() => onModeChange("recover")}
                className="text-[12px] font-bold underline underline-offset-2"
              >
                Passwort vergessen?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className="text-[12px] font-bold underline underline-offset-2"
            >
              {isRegister ? "Schon registriert? Anmelden" : "Zurück zur Anmeldung"}
            </button>
          )}
        </div>
        <LegalLinks className="mt-6" />
      </section>
    </main>
  );
}

function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={cx("flex gap-4 text-[11px] text-[var(--muted)]", className)}>
      <Link href="/impressum" className="underline underline-offset-2">
        Impressum
      </Link>
      <Link href="/datenschutz" className="underline underline-offset-2">
        Datenschutz
      </Link>
    </p>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex flex-1 overflow-hidden md:min-h-[calc(100vh-48px)]">
      <Image
        src="/welcome-movement.png"
        alt="Bewegungssilhouette mit roter Flagge"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 62vw"
        className="object-cover object-left-bottom md:w-[58%] md:max-w-[720px]"
      />
      <div className="relative z-10 flex flex-1 flex-col px-8 pb-8 pt-[18vh] md:ml-[48%] md:max-w-[620px] md:px-12 md:pb-12 md:pt-24 lg:pt-32">
        <div className="ml-[35%] max-w-[230px] md:ml-0 md:max-w-none">
          <p className="hidden text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--red)] md:block">
            Webbasiertes Capture-Tool
          </p>
          <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--green)] md:mt-4 md:text-[64px] lg:text-[72px]">
            Rote Agenda
          </h1>
          <p className="mt-6 font-display text-[17px] font-bold leading-7 text-[var(--ink)] md:max-w-[430px] md:text-[23px] md:leading-9">
            Der rote Faden für deine Projekte.
          </p>
          <div className="mt-8 h-0.5 w-10 bg-[var(--red)]" />
          <p className="mt-6 max-w-[210px] font-display text-[14px] italic leading-6 text-[var(--ink-soft)] md:max-w-[470px] md:text-[16px] md:leading-8">
            Organisiere Gedanken. Strukturiere Projekte. Verändere die Welt.
          </p>
          <p className="mt-5 hidden max-w-[500px] text-[14px] leading-7 text-[var(--muted)] md:block">
            Zuerst als schnelles Webtool gedacht: am Handy sofort erfassen,
            am Desktop Aufgaben, Projekte und KI-Vorschläge bequem prüfen.
            Die Oberfläche bleibt später gut als Android-App adaptierbar.
          </p>
        </div>

        <div className="mt-auto space-y-6 md:max-w-sm">
          <button
            type="button"
            onClick={onStart}
            className="flex h-15 w-full items-center justify-between rounded-[6px] border border-white/70 bg-[var(--green)] px-8 font-display text-[16px] font-bold text-[var(--cream)] shadow-lg shadow-black/10 transition hover:bg-[var(--green-2)]"
          >
            <span>Los geht&apos;s</span>
            <ChevronRight className="h-5 w-5" />
          </button>
          <LegalLinks className="justify-center text-[var(--cream)] md:justify-start md:text-[var(--muted)]" />
        </div>
      </div>
    </div>
  );
}

function TodayScreen({
  tasks,
  projects,
  filter,
  aiStats,
  onFilterChange,
  onOpenTask,
  onToggleTask,
  onCapture,
  onOpenInbox,
  onOpenMore,
}: {
  tasks: Task[];
  projects: Map<string, Project>;
  filter: TaskFilter;
  aiStats: AiStats;
  onFilterChange: (filter: TaskFilter) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCapture: () => void;
  onOpenInbox: () => void;
  onOpenMore: () => void;
}) {
  const isBrandNew = !tasks.length && !aiStats.processedNotes && filter === "all";

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title="Heute"
        leftIcon={<Menu className="h-6 w-6" />}
        rightIcon={<Bell className="h-5 w-5" />}
        leftLabel="Mehr öffnen"
        rightLabel="Inbox öffnen"
        onLeft={onOpenMore}
        onRight={onOpenInbox}
      />

      <button
        type="button"
        onClick={onCapture}
        className="mt-6 flex h-[68px] items-center justify-between rounded-[6px] bg-[var(--green)] p-3 pl-5 text-left text-[14px] font-medium text-white shadow-md shadow-black/10"
      >
        <span>Was beschäftigt dich?</span>
        <span className="grid h-11 w-11 place-items-center rounded-[4px] bg-[var(--red)]">
          <Plus className="h-6 w-6" />
        </span>
      </button>

      {aiStats.processedNotes ? (
        <button
          type="button"
          onClick={onOpenInbox}
          className="mt-5 w-full rounded-[5px] border border-[var(--line)] bg-white/50 p-4 text-left shadow-sm transition hover:bg-white/70"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.03em]">
              <Sparkles className="h-4 w-4 text-[var(--green)]" />
              KI-Update
            </div>
            <ChevronRight className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[13px] font-bold">
            {aiStats.processedNotes}{" "}
            {aiStats.processedNotes === 1 ? "Notiz" : "Notizen"} verarbeitet
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <span>{aiStats.acceptedCount} übernommen</span>
            <span>{aiStats.pendingCount} zu prüfen</span>
          </div>
        </button>
      ) : null}

      <div className="mt-9 flex items-end justify-between">
        <h2 className="font-display text-[20px] font-bold">Meine Aufgaben</h2>
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className="text-[12px] font-semibold underline underline-offset-2"
        >
          Alle anzeigen
        </button>
      </div>

      <TaskTabs value={filter} onChange={onFilterChange} />

      <div className="mt-3 divide-y divide-[var(--line)]">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              project={projects.get(task.projectId)}
              onOpen={() => onOpenTask(task.id)}
              onToggle={() => onToggleTask(task.id)}
            />
          ))
        ) : isBrandNew ? (
          <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
            <p className="font-display text-[18px] font-bold">Willkommen bei Rote Agenda</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
              Halte einfach fest, was dich beschäftigt. Die KI macht daraus
              Aufgabenvorschläge, die du prüfst und übernimmst.
            </p>
            <button
              type="button"
              onClick={onCapture}
              className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Erste Notiz erfassen
            </button>
          </div>
        ) : (
          <EmptyState
            title="Keine Aufgaben in dieser Ansicht"
            text="Alles ruhig. Neue Rohnotizen landen zuerst im Capture."
          />
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
  onBack,
  onChangeText,
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
  onBack: () => void;
  onChangeText: (value: string) => void;
  onProcess: () => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title="Schnellnotiz"
        leftIcon={<ArrowLeft className="h-5 w-5" />}
        leftLabel="Zurück"
        onLeft={onBack}
        rightIcon={<Sparkles className="h-5 w-5" />}
      />

      <div className="mt-8 rounded-[7px] border border-[var(--line)] bg-white/55 p-4">
        <textarea
          value={captureText}
          onChange={(event) => onChangeText(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Schreib einfach alles rein – Gedanken, Aufgaben, Notizen, Gesprächsfetzen…"
          className="min-h-44 w-full resize-none bg-transparent text-[16px] leading-7 outline-none placeholder:text-[var(--muted)]"
        />
        <button
          type="button"
          onClick={onProcess}
          disabled={!captureText.trim() || isProcessing}
          className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--red)] px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-[var(--red-dark)] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isProcessing ? "KI verarbeitet..." : `Mit ${modelLabel} verarbeiten`}
        </button>
        {error ? (
          <p className="mt-3 rounded-[5px] border border-[var(--red)] bg-white/70 p-3 text-[12px] leading-5 text-[var(--red)]">
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
            Beispiele: „Chef meinte, ich soll bis Freitag nochmal die Präsentation
            überarbeiten“ oder „Idee: Register-Fälle automatisch clustern“.
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
  onEditSuggestion,
  onUpdateSuggestion,
  onAccept,
  onReject,
  onOpenMore,
}: {
  suggestions: AiSuggestion[];
  projects: Project[];
  editingSuggestionId: string | null;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onOpenMore: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title="Inbox"
        leftIcon={<Inbox className="h-5 w-5" />}
        rightIcon={<MoreHorizontal className="h-5 w-5" />}
        rightLabel="Mehr öffnen"
        onRight={onOpenMore}
      />
      <p className="mt-5 text-[13px] leading-6 text-[var(--muted)]">
        Ungeprüfte KI-Vorschläge bleiben hier, bis du sie annimmst, änderst oder ablehnst.
      </p>

      <div className="mt-6 space-y-4">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              projects={projects}
              isEditing={editingSuggestionId === suggestion.id}
              compact
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
          <EmptyState title="Inbox ist leer" text="Alle Vorschläge sind geprüft." />
        )}
      </div>
    </div>
  );
}

function ProjectsScreen({
  projects,
  tasks,
  onOpenProject,
  onCreateProject,
}: {
  projects: Project[];
  tasks: Task[];
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title="Projekte"
        leftIcon={<FolderKanban className="h-5 w-5" />}
        rightIcon={<Plus className="h-5 w-5" />}
        rightLabel="Neues Projekt anlegen"
        onRight={onCreateProject}
      />
      {!projects.length ? (
        <div className="mt-6 rounded-[7px] border border-dashed border-[var(--line-strong)] p-5">
          <p className="font-display text-[18px] font-bold">Noch keine Projekte</p>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            Projekte bündeln deine Aufgaben. Die KI schlägt bei neuen Notizen
            automatisch passende Projekte vor – oder du legst selbst eins an.
          </p>
          <button
            type="button"
            onClick={onCreateProject}
            className="mt-4 flex items-center gap-2 rounded-[5px] bg-[var(--red)] px-4 py-3 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Projekt anlegen
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
              className="w-full rounded-[7px] border border-[var(--line)] bg-white/45 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[20px] font-bold leading-7">
                    {project.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">
                    {project.description}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px] font-semibold">
                <span>{openTasks} offen</span>
                <span>{nextDeadline ? formatDateLabel(nextDeadline) : "Ohne Deadline"}</span>
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
          leftLabel="Zurück"
          rightLabel="Projekt bearbeiten"
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Projekt
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {project.title}
        </h1>
        <div className="mt-8 flex items-center justify-between text-[13px]">
          <span>Fortschritt</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} className="mt-3" />
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as ProjectDetailTab)}
        tabs={["tasks", "details", "notes"]}
        labels={{ tasks: "Aufgaben", details: "Details", notes: "Notizen" }}
      />

      <div className="px-6 md:px-8 lg:px-10">
        {tab === "tasks" ? (
          <div className="divide-y divide-[var(--line)]">
            {tasks.map((task) => (
              <TaskLine
                key={task.id}
                task={task}
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
              Aufgabe hinzufügen
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
              className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-white/45 p-4 text-left"
            >
              <span>
                <span className="block text-[13px] font-bold">KI-Zuordnung</span>
                <span className="text-[12px] text-[var(--muted)]">
                  Für dieses Projekt {project.aiEnabled ? "aktiv" : "pausiert"}
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
                Keywords
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
                  className="rounded-[6px] border border-[var(--line)] bg-white/45 p-4"
                >
                  <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
                    {note.content}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                    Rohnotiz · {formatDateLabel(note.createdAt.slice(0, 10))}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-5 text-[14px] leading-7 text-[var(--muted)]">
              Noch keine Rohnotizen zu diesem Projekt. Sobald die KI Notizen
              hierher zuordnet, erscheinen sie in dieser Liste.
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
          leftLabel="Zurück"
          rightLabel="Aufgabe bearbeiten"
          onLeft={onBack}
          onRight={onEdit}
        />
        <p className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          {project?.title ?? "Aufgabe"}
        </p>
        <h1 className="mt-4 font-display text-[29px] font-bold leading-tight">
          {task.title}
        </h1>
        <div className="mt-7 grid grid-cols-2 gap-3 text-[12px]">
          <InfoTile label="Status" value={statusLabels[task.status]} />
          <InfoTile label="Deadline" value={formatDateLabel(task.dueDate)} />
          <InfoTile label="Priorität" value={priorityLabels[task.priority]} />
          <button
            type="button"
            onClick={onOpenProject}
            className="rounded-[6px] border border-[var(--line)] bg-white/45 p-3 text-left"
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">
              Projekt
            </span>
            <span className="mt-1 block font-bold">{project?.title ?? "Ohne Projekt"}</span>
          </button>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-[6px] border border-[var(--line)] bg-white/45 p-4 text-[14px] font-bold">
          <button
            type="button"
            onClick={onToggleDone}
            className="grid h-6 w-6 place-items-center text-[var(--red)]"
          >
            {task.status === "done" ? <CheckSquare2 className="h-5 w-5" /> : <Square className="h-5 w-5" />}
          </button>
          Erledigt
        </label>
      </div>

      <DetailTabs
        value={tab}
        onChange={(value) => onTabChange(value as TaskDetailTab)}
        tabs={["details", "raw", "ai"]}
        labels={{ details: "Details", raw: "Rohnotiz", ai: "KI" }}
      />

      <div className="space-y-5 px-6 md:px-8 lg:px-10">
        {tab === "details" ? (
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
            Beschreibung
          </h2>
          <p className="mt-2 text-[14px] leading-7 text-[var(--ink-soft)]">
            {task.description || "Keine Beschreibung hinterlegt."}
          </p>
        </section>
        ) : null}
        {tab === "raw" ? (
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
            Ursprüngliche Rohnotiz
          </h2>
          <p className="mt-2 rounded-[6px] bg-white/45 p-4 text-[13px] leading-6 text-[var(--muted)]">
            {rawNote?.content ?? "Diese Aufgabe wurde manuell erstellt."}
          </p>
        </section>
        ) : null}
        {tab === "ai" ? (
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
            KI-Zusammenfassung
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
            {suggestion?.reasoning ?? "Keine KI-Zusammenfassung vorhanden."}
          </p>
        </section>
        ) : null}
      </div>
    </div>
  );
}

function MoreScreen({
  userName,
  userEmail,
  aiModel,
  syncStatus,
  onAiModelChange,
  onDeleteAll,
  onLogout,
}: {
  userName: string;
  userEmail: string;
  aiModel: AiModelId;
  syncStatus: SyncStatus;
  onAiModelChange: (model: AiModelId) => void;
  onDeleteAll: () => void;
  onLogout: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const syncLabel =
    syncStatus === "saving"
      ? "Appwrite speichert..."
      : syncStatus === "error"
        ? "Fehler beim Speichern"
        : "Alles gespeichert";

  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader title="Mehr" leftIcon={<MoreHorizontal className="h-5 w-5" />} />
      <div className="mt-8 space-y-3">
        <InfoTile label="Produkt" value="Rote Agenda Webtool" />
        <InfoTile label="Account" value={userName || userEmail} />
        <InfoTile label="Speicherung" value={syncLabel} />
        <section className="rounded-[6px] border border-[var(--line)] bg-white/45 p-4">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              KI-Modell
            </span>
            <select
              value={aiModel}
              onChange={(event) => onAiModelChange(event.target.value as AiModelId)}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] font-bold outline-none"
            >
              {AI_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        {confirmingDelete ? (
          <div className="rounded-[6px] border border-[var(--red)] bg-white/70 p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              Wirklich alle Projekte, Aufgaben, Notizen und Vorschläge löschen?
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              Das kann nicht rückgängig gemacht werden. Dein Account bleibt bestehen.
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
                Ja, alles löschen
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-white/45 p-4 text-[13px] font-bold text-[var(--red)]"
          >
            Alle Daten löschen
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between rounded-[6px] border border-[var(--line)] bg-white/45 p-4 text-[13px] font-bold"
        >
          Abmelden
          <X className="h-4 w-4" />
        </button>
        <LegalLinks className="pt-2" />
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
  onChange,
}: {
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
}) {
  const tabs: Array<{ value: TaskFilter; label: string }> = [
    { value: "all", label: "Alle" },
    { value: "today", label: "Heute" },
    { value: "planned", label: "Geplant" },
    { value: "later", label: "Später" },
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
  onOpen,
  onToggle,
}: {
  task: Task;
  project?: Project;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[66px] items-center gap-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="grid h-8 w-8 shrink-0 place-items-center text-[var(--red)]"
      >
        {task.status === "done" ? (
          <CheckSquare2 className="h-5 w-5 fill-[var(--red)] text-white" />
        ) : task.priority === "high" ? (
          <Flag className="h-5 w-5 fill-[var(--red)] text-[var(--red)]" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p
          className={cx(
            "truncate text-[14px] font-semibold",
            task.status === "done" && "text-[var(--muted)] line-through",
          )}
        >
          {task.title}
        </p>
        <p className="mt-1 truncate text-[12px] text-[var(--muted)]">
          {project?.title ?? "Ohne Projekt"}
        </p>
      </button>
      <span
        className={cx(
          "shrink-0 text-[12px]",
          task.status !== "done" && isOverdue(task.dueDate)
            ? "font-bold text-[var(--red)]"
            : "text-[var(--ink-soft)]",
        )}
      >
        {task.status !== "done" && isOverdue(task.dueDate) ? "Überfällig · " : ""}
        {formatDateLabel(task.dueDate)}
      </span>
    </div>
  );
}

function TaskLine({
  task,
  onOpen,
  onToggle,
}: {
  task: Task;
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
      <span className="text-[12px] text-[var(--ink-soft)]">{formatDateLabel(task.dueDate)}</span>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  projects,
  isEditing,
  compact,
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
      <div className="rounded-[7px] border border-[var(--line)] bg-white/45 p-4 text-[13px] font-bold text-[var(--muted)]">
        Vorschlag {suggestion.state === "accepted" ? "übernommen" : "ignoriert"}.
      </div>
    );
  }

  if (isEditing) {
    return (
      <SuggestionEditor
        suggestion={suggestion}
        projects={projects}
        onCancel={onCancelEdit}
        onSave={onUpdate}
      />
    );
  }

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-white/55 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[var(--red)]">
            {suggestionStatus(suggestion)}
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
        <InfoTile label="Projekt" value={project?.title ?? suggestion.suggestedNewProjectTitle ?? "Unklar"} />
        <InfoTile label="Deadline" value={formatDateLabel(suggestion.dueDate)} />
        <InfoTile label="Priorität" value={priorityLabels[suggestion.priority]} />
        <InfoTile label="Quelle" value="Rohnotiz" />
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
          Übernehmen
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          Bearbeiten
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          Anderem Projekt zuordnen
        </button>
        <button
          type="button"
          onClick={onCreateTask}
          className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          Neue Aufgabe erstellen
        </button>
      </div>
      <button
        type="button"
        onClick={onReject}
        className="mt-3 text-[12px] font-bold text-[var(--muted)] underline underline-offset-2"
      >
        Ignorieren
      </button>
    </article>
  );
}

function SuggestionEditor({
  suggestion,
  projects,
  onCancel,
  onSave,
}: {
  suggestion: AiSuggestion;
  projects: Project[];
  onCancel: () => void;
  onSave: (suggestion: AiSuggestion) => void;
}) {
  const [draft, setDraft] = useState(suggestion);

  return (
    <article className="rounded-[7px] border border-[var(--line)] bg-white/70 p-4 shadow-sm">
      <div className="space-y-3">
        <Field label="Aufgabe">
          <input
            value={draft.suggestedTitle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, suggestedTitle: event.target.value }))
            }
            className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
          />
        </Field>
        <Field label="Projekt">
          <select
            value={draft.suggestedProjectId ?? "__new"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                suggestedProjectId: event.target.value === "__new" ? null : event.target.value,
                suggestedNewProjectTitle:
                  event.target.value === "__new" ? current.suggestedNewProjectTitle ?? "Neues Projekt" : null,
              }))
            }
            className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
            <option value="__new">Neues Projekt vorschlagen</option>
          </select>
        </Field>
        {!draft.suggestedProjectId ? (
          <Field label="Neues Projekt">
            <input
              value={draft.suggestedNewProjectTitle ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  suggestedNewProjectTitle: event.target.value,
                }))
              }
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline">
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueDate: event.target.value || null,
                }))
              }
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            />
          </Field>
          <Field label="Priorität">
            <select
              value={draft.priority}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priority: event.target.value as TaskPriority,
                }))
              }
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
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
          Speichern
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
        >
          Abbrechen
        </button>
      </div>
    </article>
  );
}

function TaskEditor({
  task,
  projects,
  onClose,
  onDelete,
  onSave,
}: {
  task: Task;
  projects: Project[];
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState(task);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">Aufgabe bearbeiten</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field label="Titel">
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            />
          </Field>
          <Field label="Beschreibung">
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-24 w-full resize-none rounded-[5px] border border-[var(--line)] bg-white px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label="Projekt">
            <select
              value={draft.projectId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, projectId: event.target.value }))
              }
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TaskStatus,
                  }))
                }
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-2 text-[12px] outline-none"
              >
                <option value="open">Offen</option>
                <option value="in_progress">In Arbeit</option>
                <option value="done">Erledigt</option>
              </select>
            </Field>
            <Field label="Priorität">
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-2 text-[12px] outline-none"
              >
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
              </select>
            </Field>
            <Field label="Deadline">
              <input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dueDate: event.target.value || null }))
                }
                className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-2 text-[12px] outline-none"
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
            Speichern
          </button>
          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
          >
            Löschen
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
  onClose,
  onDelete,
  onSave,
}: {
  project: Project;
  isNew: boolean;
  taskCount: number;
  onClose: () => void;
  onDelete: (projectId: string) => void;
  onSave: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [keywordsText, setKeywordsText] = useState(project.keywords.join(", "));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 md:place-items-center md:p-6">
      <div className="w-full max-w-[430px] rounded-t-[18px] bg-[var(--paper-soft)] p-6 shadow-2xl md:rounded-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">
            {isNew ? "Projekt anlegen" : "Projekt bearbeiten"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field label="Titel">
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            />
          </Field>
          <Field label="Beschreibung">
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-20 w-full resize-none rounded-[5px] border border-[var(--line)] bg-white px-3 py-3 text-[13px] outline-none"
            />
          </Field>
          <Field label="Keywords (durch Komma getrennt)">
            <input
              value={keywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              placeholder="z. B. kunde, angebot, newsletter"
              className="h-11 w-full rounded-[5px] border border-[var(--line)] bg-white px-3 text-[13px] outline-none"
            />
          </Field>
          <label className="flex items-center justify-between rounded-[5px] border border-[var(--line)] bg-white px-3 py-3 text-[13px] font-bold">
            KI darf Notizen diesem Projekt zuordnen
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
          <div className="mt-5 rounded-[6px] border border-[var(--red)] bg-white/70 p-4">
            <p className="text-[13px] font-bold text-[var(--red)]">
              Projekt löschen{taskCount ? ` – inklusive ${taskCount} ${taskCount === 1 ? "Aufgabe" : "Aufgaben"}` : ""}?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="flex-1 rounded-[5px] bg-[var(--red)] px-3 py-3 text-[12px] font-bold text-white"
              >
                Ja, löschen
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[12px] font-bold"
              >
                Abbrechen
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
              Speichern
            </button>
            {!isNew ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-[5px] border border-[var(--line-strong)] px-3 py-3 text-[13px] font-bold text-[var(--red)]"
              >
                Löschen
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
  onNavigate,
}: {
  screen: Screen;
  pendingCount: number;
  onNavigate: (screen: Screen) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: "Heute", icon: Home },
    { screen: "projects" as Screen, label: "Projekte", icon: ClipboardList },
    { screen: "inbox" as Screen, label: "Inbox", icon: Inbox, count: pendingCount },
    { screen: "more" as Screen, label: "Mehr", icon: MoreHorizontal },
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
          aria-label="Schnellnotiz erfassen"
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
  onNavigate,
}: {
  screen: Screen;
  pendingCount: number;
  onNavigate: (screen: Screen) => void;
}) {
  const items = [
    { screen: "today" as Screen, label: "Heute", icon: Home },
    { screen: "projects" as Screen, label: "Projekte", icon: ClipboardList },
    { screen: "inbox" as Screen, label: `Inbox${pendingCount ? ` (${pendingCount})` : ""}`, icon: Inbox },
    { screen: "more" as Screen, label: "Mehr", icon: MoreHorizontal },
  ];

  return (
    <aside className="sticky top-6 hidden rounded-[12px] border border-[var(--line)] bg-white/35 p-4 md:block">
      <div className="px-2">
        <p className="font-display text-[24px] font-bold">Rote Agenda</p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
          Der rote Faden für deine Projekte.
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
                active ? "bg-[var(--green)] text-white" : "hover:bg-white/55",
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
        Schnell erfassen
      </button>
    </aside>
  );
}

function DesktopInsightPanel({
  data,
  selectedProject,
  onCapture,
  onOpenInbox,
}: {
  data: AppData;
  selectedProject?: Project;
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
      <section className="rounded-[12px] border border-[var(--line)] bg-white/35 p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
          Fokus
        </p>
        <h2 className="mt-3 font-display text-[26px] font-bold">
          {openTasks.length} offene Aufgaben
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          Capture bleibt schnell, die Ordnung passiert danach in Vorschlägen und Projekten.
        </p>
        <button
          type="button"
          onClick={onCapture}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--green)] px-4 py-3 text-[13px] font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          Neue Rohnotiz
        </button>
      </section>

      {selectedProject ? (
        <section className="rounded-[12px] border border-[var(--line)] bg-white/35 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
                Aktives Projekt
              </p>
              <h2 className="mt-3 font-display text-[23px] font-bold">
                {selectedProject.title}
              </h2>
            </div>
            <Tags className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <ProgressBar value={projectProgress(selectedProject, projectTasks)} className="mt-5" />
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            {projectTasks.filter((task) => task.status !== "done").length} offene Aufgaben
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onOpenInbox}
        className="flex w-full items-center justify-between rounded-[12px] border border-[var(--line)] bg-white/35 p-5 text-left"
      >
        <span>
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--red)]">
            KI-Prüfung
          </span>
          <span className="mt-2 block font-display text-[22px] font-bold">
            {pending.length} Vorschläge offen
          </span>
        </span>
        <ChevronRight className="h-5 w-5" />
      </button>
    </aside>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-black/12", className)}>
      <div
        className="h-full rounded-full bg-[var(--red)] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-white/45 p-3">
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

function suggestionStatus(suggestion: AiSuggestion) {
  if (suggestion.suggestedNewProjectTitle) return "Neues Projekt vorgeschlagen";
  if (suggestion.needsReview) return "Rückfrage nötig";
  if (suggestion.confidence < 0.75) return "Unsicher";
  return "Sicher zugeordnet";
}

function projectProgress(project: Project, tasks: Task[]) {
  if (!tasks.length) return project.progress;
  const done = tasks.filter((task) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unerwarteter Fehler. Bitte versuche es erneut.";
}

function aiModelLabel(model: AiModelId) {
  return AI_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model;
}
