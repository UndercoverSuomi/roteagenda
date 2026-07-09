import { NextResponse } from "next/server";
import {
  generateGraphInsights,
  MAX_INSIGHT_EDGES,
  MAX_INSIGHT_NODES,
  resolveAiModelConfig,
  type GraphInsightNode,
} from "@/lib/ai-server";
import { isLocale } from "@/lib/i18n";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";

export const runtime = "nodejs";

// Die Analyse verarbeitet den ganzen Notizbestand — bewusst knapper gedrosselt.
const enforceRateLimit = createRateLimiter(10 * 60_000, 5);

const MIN_NODES = 3;

type GraphInsightsRequestBody = {
  modelId?: unknown;
  locale?: unknown;
  nodes?: unknown;
  edges?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const modelId = readModelId(body.modelId);
    const locale =
      typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "de";
    const nodes = readNodes(body.nodes);
    const edges = readEdges(body.edges, nodes.length);

    const resolved = resolveAiModelConfig(modelId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const insights = await generateGraphInsights({
      config: resolved.config,
      nodes,
      edges,
      locale,
    });

    return NextResponse.json(insights);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler bei der Netz-Analyse.";
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readJsonBody(request: Request): Promise<GraphInsightsRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RouteError("Die Analyse-Anfrage ist ungültig.", 400);
    }

    return body as GraphInsightsRequestBody;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Die Analyse-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Bitte wähle in den Einstellungen ein KI-Modell aus.", 400);
  }

  return value.trim();
}

function readNodes(value: unknown): GraphInsightNode[] {
  if (!Array.isArray(value)) {
    throw new RouteError("Die Knotenliste für die Analyse ist ungültig.", 400);
  }

  const nodes = value.slice(0, MAX_INSIGHT_NODES).flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== "string" || !item.title.trim()) {
      return [];
    }

    return [
      {
        title: item.title.slice(0, 120),
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
          : [],
        project:
          typeof item.project === "string" && item.project.trim()
            ? item.project.slice(0, 80)
            : null,
        degree:
          typeof item.degree === "number" && Number.isFinite(item.degree)
            ? Math.max(0, Math.round(item.degree))
            : 0,
      },
    ];
  });

  if (nodes.length < MIN_NODES) {
    throw new RouteError(
      "Für eine Analyse braucht das Netz mindestens drei Notizen.",
      400,
    );
  }

  return nodes;
}

function readEdges(value: unknown, nodeCount: number): Array<[number, number]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new RouteError("Die Kantenliste für die Analyse ist ungültig.", 400);
  }

  return value.slice(0, MAX_INSIGHT_EDGES).flatMap((item) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      !Number.isInteger(item[0]) ||
      !Number.isInteger(item[1])
    ) {
      return [];
    }

    const [a, b] = item as [number, number];
    if (a < 0 || b < 0 || a >= nodeCount || b >= nodeCount || a === b) return [];
    return [[a, b] as [number, number]];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
