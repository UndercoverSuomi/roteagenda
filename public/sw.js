// Service Worker für Rote Agenda: cached die App-Shell und statische Assets,
// damit die PWA offline startet. Cross-Origin-Requests (Appwrite, Google)
// und die KI-Routen unter /api/ werden bewusst nie angefasst.

const CACHE_NAME = "rote-agenda-v2";
const APP_SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Inhalts-gehashte Build-Dateien ändern sich nie unter derselben URL.
function isImmutableAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

// Feste URLs, deren Inhalt sich mit einem Deploy ändern kann — die dürfen
// nicht für immer aus dem Cache kommen.
function isMutableAsset(pathname) {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/welcome-movement.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Seitenaufrufe: Netz zuerst (frische Deploys), sonst gecachte Shell.
  // Query-Parameter (?s=...) werden ignoriert – alle Screens teilen die Shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(url.pathname, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((cached) => cached ?? caches.match(APP_SHELL))
            .then((cached) => cached ?? Response.error()),
        ),
    );
    return;
  }

  // Gehashte Build-Assets: Cache zuerst, Netz als Fallback.
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy))
                .catch(() => undefined);
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Icons/Manifest/Bilder: sofort aus dem Cache antworten, im Hintergrund
  // aktualisieren (stale-while-revalidate) — so bleiben sie nach einem
  // Deploy nicht dauerhaft alt.
  if (isMutableAsset(url.pathname)) {
    const refresh = fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      });

    event.respondWith(
      caches.match(request).then((cached) => cached ?? refresh).catch(() => refresh),
    );
    event.waitUntil(refresh.catch(() => undefined));
  }
});
