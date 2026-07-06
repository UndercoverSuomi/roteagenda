// Bildet den App-Zustand (Screen + Auswahl) auf URL-Query-Parameter ab.
// So funktionieren Browser-Zurück und Deep-Links, ohne dass die App
// echte Next.js-Routen pro Screen braucht ("/" bleibt statisch).

const URL_SCREENS = [
  "today",
  "capture",
  "inbox",
  "projects",
  "project",
  "task",
  "more",
  "search",
] as const;

export type UrlScreen = (typeof URL_SCREENS)[number];

export type AppUrlState = {
  screen: UrlScreen;
  projectId: string | null;
  taskId: string | null;
};

export function isUrlScreen(value: string): value is UrlScreen {
  return (URL_SCREENS as readonly string[]).includes(value);
}

export function buildAppUrl(state: AppUrlState): string {
  const params = new URLSearchParams();

  if (state.screen !== "today") {
    params.set("s", state.screen);
  }
  if (state.projectId && (state.screen === "project" || state.screen === "task")) {
    params.set("p", state.projectId);
  }
  if (state.taskId && state.screen === "task") {
    params.set("t", state.taskId);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function parseAppUrl(search: string): AppUrlState {
  const params = new URLSearchParams(search);
  const rawScreen = params.get("s") ?? "today";
  const screen = isUrlScreen(rawScreen) ? rawScreen : "today";
  const projectId = params.get("p");
  const taskId = params.get("t");

  // Detail-Screens sind ohne ID nicht adressierbar und fallen auf Heute zurück.
  if (screen === "task") {
    return taskId
      ? { screen, projectId, taskId }
      : { screen: "today", projectId: null, taskId: null };
  }
  if (screen === "project") {
    return projectId
      ? { screen, projectId, taskId: null }
      : { screen: "today", projectId: null, taskId: null };
  }

  return { screen, projectId: null, taskId: null };
}
