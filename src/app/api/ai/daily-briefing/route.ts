import { NextResponse } from "next/server";
import {
  generateDailyBriefing,
  resolveAiModelConfig,
  type BriefingTask,
} from "@/lib/ai-server";
import { isLocale } from "@/lib/i18n";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";
import type { TaskPriority } from "@/lib/types";

export const runtime = "nodejs";

const enforceRateLimit = createRateLimiter(10 * 60_000, 10);

const MAX_BRIEFING_TASKS = 100;

type BriefingRequestBody = {
  modelId?: unknown;
  tasks?: unknown;
  today?: unknown;
  locale?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const modelId = readModelId(body.modelId);
    const tasks = readTasks(body.tasks);
    const today = readToday(body.today);
    const locale =
      typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "de";

    const resolved = resolveAiModelConfig(modelId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const text = await generateDailyBriefing({
      config: resolved.config,
      tasks,
      today,
      locale,
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler beim Tagesbriefing.";
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readJsonBody(request: Request): Promise<BriefingRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RouteError("Die Briefing-Anfrage ist ungültig.", 400);
    }

    return body as BriefingRequestBody;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Die Briefing-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Bitte wähle in den Einstellungen ein KI-Modell aus.", 400);
  }

  return value.trim();
}

function readToday(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return undefined;
}

function readTasks(value: unknown): BriefingTask[] {
  if (!Array.isArray(value) || !value.length) {
    throw new RouteError("Für das Briefing wurden keine Aufgaben übermittelt.", 400);
  }

  const tasks = value.slice(0, MAX_BRIEFING_TASKS).flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== "string" || !item.title.trim()) {
      return [];
    }

    return [
      {
        title: item.title,
        dueDate:
          typeof item.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)
            ? item.dueDate
            : null,
        priority: readPriority(item.priority),
        project: typeof item.project === "string" && item.project.trim() ? item.project : null,
      },
    ];
  });

  if (!tasks.length) {
    throw new RouteError("Für das Briefing wurden keine gültigen Aufgaben übermittelt.", 400);
  }

  return tasks;
}

function readPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
