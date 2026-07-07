import { NextResponse } from "next/server";
import {
  resolveAiModelConfig,
  summarizeWebText,
  summarizeYouTubeVideo,
} from "@/lib/ai-server";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";
import {
  assertPublicHttpUrl,
  extractHtmlTitle,
  fetchPublicPage,
  fetchYouTubeOEmbed,
  htmlToText,
  parseYouTubeVideoId,
} from "@/lib/web-content";

export const runtime = "nodejs";

const enforceRateLimit = createRateLimiter(10 * 60_000, 10);

const MAX_URL_LENGTH = 2048;

type SummarizeUrlRequestBody = {
  url?: unknown;
  modelId?: unknown;
  locale?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const rawUrl = readUrl(body.url);
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    const locale: Locale =
      typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "de";

    // YouTube: das Video wird tatsächlich "angesehen" (Gemini via OpenRouter).
    if (parseYouTubeVideoId(rawUrl)) {
      await assertPublicHttpUrl(rawUrl);
      const meta = await fetchYouTubeOEmbed(rawUrl);

      try {
        const text = await summarizeYouTubeVideo({
          url: rawUrl,
          title: meta?.title,
          author: meta?.author,
          locale,
        });
        return NextResponse.json({ text, title: meta?.title ?? null });
      } catch (error) {
        // Ehrliche Degradierung: Metadaten-Notiz statt harter Fehler —
        // aber nur, wenn wenigstens die Metadaten da sind.
        if (!meta) throw error;
        return NextResponse.json({
          text: buildYouTubeFallback(rawUrl, meta, locale, error),
          title: meta.title || null,
        });
      }
    }

    // Normale Webseite: abrufen, zu Text reduzieren, zusammenfassen.
    const resolved = resolveAiModelConfig(modelId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const page = await fetchPublicPage(rawUrl);
    const title = page.contentType.includes("text/html")
      ? extractHtmlTitle(page.body)
      : null;
    const pageText = page.contentType.includes("text/html")
      ? htmlToText(page.body)
      : page.body;

    if (!pageText.trim()) {
      throw new RouteError("Auf der Seite wurde kein lesbarer Text gefunden.", 422);
    }

    const text = await summarizeWebText({
      config: resolved.config,
      pageText,
      url: page.finalUrl,
      title,
      locale,
    });

    return NextResponse.json({ text, title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler bei der Link-Analyse.";
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

function buildYouTubeFallback(
  url: string,
  meta: { title: string; author: string },
  locale: Locale,
  error: unknown,
) {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  const header = [meta.title, meta.author ? `— ${meta.author}` : ""]
    .filter(Boolean)
    .join(" ");

  return locale === "en"
    ? `YouTube video: ${header}\n${url}\n\nAutomatic video analysis was not possible${detail}.`
    : `YouTube-Video: ${header}\n${url}\n\nDie automatische Video-Analyse war nicht möglich${detail}.`;
}

async function readJsonBody(request: Request): Promise<SummarizeUrlRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RouteError("Die Link-Anfrage ist ungültig.", 400);
    }

    return body as SummarizeUrlRequestBody;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Die Link-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Es wurde kein Link übermittelt.", 400);
  }

  const url = value.trim();
  if (url.length > MAX_URL_LENGTH) {
    throw new RouteError("Der Link ist zu lang.", 400);
  }

  return url;
}
