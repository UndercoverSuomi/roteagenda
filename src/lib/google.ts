// Optionale Google-Integration: Aufgaben mit Datum landen im Google Kalender,
// Aufgaben ohne Datum in Google Tasks. Terminvorschläge der KI werden als
// zeitgenaue Kalendereinträge übergeben.
//
// Ohne NEXT_PUBLIC_GOOGLE_CLIENT_ID funktioniert nur der Kalender-Weg über
// die offizielle Vorbefüll-URL (öffnet Google Kalender mit fertigem Termin).
// Mit Client-ID laufen beide Wege direkt über die Google-APIs (OAuth-Popup
// beim ersten Mal, Token bleibt nur im Speicher der Seite).

import { addDays, toIsoDate } from "./date.ts";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export type GoogleTaskInput = {
  title: string;
  description: string;
  dueDate: string | null;
};

// start ist entweder ein ganzer Tag ("YYYY-MM-DD") oder ein lokaler
// Zeitpunkt ("YYYY-MM-DDTHH:MM"). Ohne end: ganztägig +1 Tag, sonst +1 Stunde.
export type CalendarEventInput = {
  title: string;
  description: string;
  start: string;
  end?: string | null;
};

function isTimed(value: string) {
  return value.includes("T");
}

function toTemplateStamp(value: string) {
  const stamp = value.replaceAll("-", "").replaceAll(":", "");
  return isTimed(value) ? `${stamp}00` : stamp;
}

function toTimeStamp(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toIsoDate(date)}T${hours}:${minutes}`;
}

function defaultEnd(start: string) {
  if (isTimed(start)) {
    const date = new Date(start);
    date.setHours(date.getHours() + 1);
    return toTimeStamp(date);
  }

  // Ganztägiger Termin: Ende ist der Folgetag (exklusiv).
  return toIsoDate(addDays(new Date(`${start}T12:00:00`), 1));
}

export function buildCalendarTemplateUrl(event: CalendarEventInput) {
  const end = event.end || defaultEnd(event.start);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toTemplateStamp(event.start)}/${toTemplateStamp(end)}`,
  });
  if (event.description) {
    params.set("details", event.description);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function addTaskToGoogleTasks(task: GoogleTaskInput) {
  const token = await getAccessToken(TASKS_SCOPE);
  const body: Record<string, unknown> = { title: task.title };
  if (task.description) body.notes = task.description;
  if (task.dueDate) body.due = `${task.dueDate}T00:00:00.000Z`;

  const response = await fetch(
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(await readGoogleError(response));
  }
}

export async function addEventToGoogleCalendar(event: CalendarEventInput) {
  const token = await getAccessToken(CALENDAR_SCOPE);
  const end = event.end || defaultEnd(event.start);

  const timed = isTimed(event.start);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body: Record<string, unknown> = {
    summary: event.title,
    start: timed ? { dateTime: `${event.start}:00`, timeZone } : { date: event.start },
    end: timed ? { dateTime: `${end}:00`, timeZone } : { date: end },
  };
  if (event.description) body.description = event.description;

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(await readGoogleError(response));
  }
}

async function readGoogleError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    if (payload.error?.message) return payload.error.message;
  } catch {
    // Ohne JSON-Detail reicht der Status.
  }

  return `HTTP ${response.status}`;
}

// ── Google Identity Services (Token-Popup) ──────────────────────────

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GisOauth = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => { requestAccessToken: () => void };
};

let gisScriptPromise: Promise<void> | null = null;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function getGisOauth(): GisOauth | null {
  const holder = window as unknown as {
    google?: { accounts?: { oauth2?: GisOauth } };
  };
  return holder.google?.accounts?.oauth2 ?? null;
}

export function preloadGoogleIdentity(): Promise<void> {
  if (!isGoogleConfigured || typeof window === "undefined") {
    return Promise.resolve();
  }
  if (getGisOauth()) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error("Google Identity Script konnte nicht geladen werden."));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

async function getAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  await preloadGoogleIdentity();
  const oauth = getGisOauth();
  if (!oauth) {
    throw new Error("Google Identity ist nicht verfügbar.");
  }

  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Keine Google-Berechtigung erhalten.",
            ),
          );
          return;
        }

        const lifetimeMs = ((response.expires_in ?? 3000) - 60) * 1000;
        tokenCache.set(scope, {
          token: response.access_token,
          expiresAt: Date.now() + lifetimeMs,
        });
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error?.message || "Google-Anmeldung abgebrochen."));
      },
    });

    client.requestAccessToken();
  });
}
