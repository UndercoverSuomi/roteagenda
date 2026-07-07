import { NextResponse } from "next/server";
import { extractImageText } from "@/lib/ai-server";
import { isLocale } from "@/lib/i18n";
import {
  createRateLimiter,
  requireAppwriteUser,
  RouteError,
} from "@/lib/route-auth";

export const runtime = "nodejs";

// Clientseitig verkleinerte JPEGs liegen typischerweise unter 500 KB;
// die Grenze lässt Luft, verhindert aber Missbrauch.
const MAX_IMAGE_BASE64_LENGTH = 6_000_000;

const enforceRateLimit = createRateLimiter(10 * 60_000, 15);

type ExtractImageRequestBody = {
  image?: unknown;
  locale?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppwriteUser(request);
    enforceRateLimit(user.$id);

    const body = await readJsonBody(request);
    const image = readImage(body.image);
    const locale =
      typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "de";

    const text = await extractImageText({
      imageBase64: image,
      locale,
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler bei der Foto-Erkennung.";
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readJsonBody(request: Request): Promise<ExtractImageRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RouteError("Die Foto-Anfrage ist ungültig.", 400);
    }

    return body as ExtractImageRequestBody;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Die Foto-Anfrage konnte nicht gelesen werden.", 400);
  }
}

function readImage(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError("Es wurde kein Bild übermittelt.", 400);
  }

  if (value.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new RouteError(
      "Das Bild ist zu groß. Bitte versuche es mit einem kleineren Ausschnitt.",
      400,
    );
  }

  return value;
}
