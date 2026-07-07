// Serverseitige Helfer für "URL → Notiz": URL-Härtung gegen SSRF,
// Seitenabruf mit Limits, HTML→Text und YouTube-Erkennung.
// NUR in Route-Handlern importieren (nutzt node:dns).

import { lookup as dnsLookup } from "node:dns/promises";

export type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

const DEFAULT_LOOKUP: LookupFn = (hostname) => dnsLookup(hostname, { all: true });

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_500_000;

// Private/lokale Bereiche, die eine eingeworfene URL nie erreichen darf.
export function isPrivateIp(ip: string): boolean {
  const value = ip.toLowerCase();

  if (value.includes(":")) {
    // IPv6: Loopback, Unspecified, Link-Local, Unique-Local, IPv4-mapped.
    if (value === "::1" || value === "::") return true;
    if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
    if (value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("::ffff:")) return isPrivateIp(value.slice(7));
    return false;
  }

  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT

  return false;
}

// Prüft Schema, Port und (per DNS) alle aufgelösten IPs der Ziel-URL.
// Hinweis: Schutz vor klassischem SSRF; DNS-Rebinding zwischen Prüfung und
// Request bleibt ein Restrisiko, das wir für diesen Anwendungsfall akzeptieren.
export async function assertPublicHttpUrl(
  rawUrl: string,
  lookup: LookupFn = DEFAULT_LOOKUP,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Die URL ist ungültig.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http- und https-Links werden unterstützt.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Links mit ungewöhnlichen Ports werden nicht unterstützt.");
  }
  if (url.username || url.password) {
    throw new Error("Links mit Zugangsdaten werden nicht unterstützt.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Lokale Adressen werden nicht unterstützt.");
  }
  // Roh-IPs direkt prüfen (auch IPv6 in eckigen Klammern).
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(bareHost) || bareHost.includes(":")) {
    if (isPrivateIp(bareHost)) {
      throw new Error("Private Adressen werden nicht unterstützt.");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new Error("Der Host der URL konnte nicht aufgelöst werden.");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Private Adressen werden nicht unterstützt.");
  }

  return url;
}

// Holt eine öffentliche Seite mit Timeout, Größen-Cap und manuell
// validierten Redirects. Liefert Roh-Body (gekappt) + Content-Type.
export async function fetchPublicPage(
  rawUrl: string,
  {
    fetchFn = fetch,
    lookup = DEFAULT_LOOKUP,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    fetchFn?: typeof fetch;
    lookup?: LookupFn;
    maxBytes?: number;
    timeoutMs?: number;
  } = {},
): Promise<{ finalUrl: string; contentType: string; body: string }> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicHttpUrl(currentUrl, lookup);

    const response = await fetchFn(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoteAgenda/1.0)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "Accept-Language": "de,en;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Die Seite leitet ohne Ziel weiter.");
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Die Seite konnte nicht geladen werden (HTTP ${response.status}).`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Nur HTML- und Textseiten können zusammengefasst werden.");
    }

    return {
      finalUrl: url.toString(),
      contentType,
      body: await readBodyCapped(response, maxBytes),
    };
  }

  throw new Error("Die Seite leitet zu oft weiter.");
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, maxBytes);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  // Überlange Seiten still kappen – der Prompt wird ohnehin gekürzt.
  void reader.cancel().catch(() => undefined);

  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= merged.length) break;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 120) : null;
}

// Reduziert HTML auf lesbaren Text (bewusst simpel, kein DOM-Parser nötig).
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

// ── YouTube ─────────────────────────────────────────────────────────

export function parseYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] || null;
  } else if (host === "youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
      id = url.pathname.split("/")[2] || null;
    }
  }

  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

export async function fetchYouTubeOEmbed(
  videoUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ title: string; author: string } | null> {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetchFn(endpoint, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { title?: unknown; author_name?: unknown };
    const title = typeof payload.title === "string" ? payload.title : "";
    const author = typeof payload.author_name === "string" ? payload.author_name : "";
    return title || author ? { title, author } : null;
  } catch {
    return null;
  }
}
