import { Account, Client } from "appwrite";
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from "@/lib/appwrite-config";

export class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function readBearerToken(value: string | null) {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireAppwriteUser(request: Request) {
  const jwt = readBearerToken(request.headers.get("authorization"));
  if (!jwt) {
    throw new RouteError(
      "Bitte melde dich erneut an. Die KI-Anfrage braucht eine gültige Appwrite-Sitzung.",
      401,
    );
  }

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setJWT(jwt);
  const account = new Account(client);

  try {
    return await account.get();
  } catch {
    throw new RouteError(
      "Bitte melde dich erneut an. Die Appwrite-Sitzung konnte nicht geprüft werden.",
      401,
    );
  }
}

// Einfache Kostenbremse pro Nutzer und Server-Instanz.
export function createRateLimiter(windowMs: number, maxRequests: number) {
  const requestLog = new Map<string, number[]>();

  // Ohne Aufräumen wächst die Map pro je gesehener userId für immer.
  function evictExpired(now: number) {
    for (const [userId, timestamps] of requestLog) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        requestLog.delete(userId);
      }
    }
  }

  return function enforce(userId: string) {
    const now = Date.now();
    evictExpired(now);
    const recent = (requestLog.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (recent.length >= maxRequests) {
      throw new RouteError(
        "Zu viele KI-Anfragen in kurzer Zeit. Bitte warte ein paar Minuten und versuche es erneut.",
        429,
      );
    }

    recent.push(now);
    requestLog.set(userId, recent);
  };
}
