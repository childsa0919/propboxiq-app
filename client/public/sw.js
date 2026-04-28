// PropBoxIQ service worker
// Network-first for navigation + API; cache-first for static assets.
// Bumping CACHE_VERSION invalidates the old cache on next install.

const CACHE_VERSION = "v9-2026-04-27-pdf-fixes";
const STATIC_CACHE = `propboxiq-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./favicon-32.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // Use addAll but tolerate failures (some URLs may not exist yet at install time)
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("propboxiq-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API calls — always go to network
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: network-first, fallback to cached index.html (offline)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("./index.html").then((r) => r || Response.error()),
      ),
    );
    return;
  }

  // Static assets: stale-while-revalidate so updates roll out without forcing a hard reload.
  // Hashed assets in /assets/* are content-addressed, so a stale copy is still correct;
  // the revalidation in the background ensures the next load gets the latest.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === "basic") {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      }),
    );
  }
});
