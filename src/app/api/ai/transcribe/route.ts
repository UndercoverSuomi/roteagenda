import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/ai-server";
import { isLocale } from "@/lib/i18n";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";

export const runtime = "nodejs";

// Base64 eines 60-Sekunden-WAV (16 kHz mono) liegt bei ~2,6 MB;
// die Grenze lässt großzügig Luft, verhindert aber Missbrauch.
const MAX_AUDIO_BASE64_LENGTH = 8_000_000;

const enforceRateLimit = createRateLimiter(10 * 60_000, 15);

type TranscribeRequestBody = {
  audio?: unknown;
  format?: unknown;
  locale?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const audio = readAudio(body.audio);
    const format = readFormat(body.format);
    const locale =
      typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "de";

    const text = await transcribeAudio({
      audioBase64: audio,
      format,
      locale,
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Transkriptionsfehler.";
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readJsonBody(request: Request): Promise<TranscribeRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RouteError("Die Transkriptions-Anfrage ist ungültig.", 400);
    }

    return body as TranscribeRequestBody;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Die Transkriptions-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readAudio(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Es wurde keine Audioaufnahme übermittelt.", 400);
  }

  if (value.length > MAX_AUDIO_BASE64_LENGTH) {
    throw new RouteError(
      "Die Aufnahme ist zu lang. Bitte sprich maximal etwa eine Minute ein.",
      400,
    );
  }

  return value;
}

function readFormat(value: unknown): "wav" | "mp3" {
  return value === "mp3" ? "mp3" : "wav";
}
