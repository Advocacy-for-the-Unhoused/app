// ===============================
// AFU LOGGER — SERVICE WORKER (CORRECTED)
// Safe caching, no CORS issues, no stale HTML
// ===============================

const CACHE_NAME = "afu-cache-v4"; // bump version to force update

// Only cache LOCAL assets that actually exist in your repo
const ASSETS = [
  "/",               // root
  "/index.html",
  "/app.js",
  "/manifest.json",
  // Remove /styles.css if you don't have it
  // "/styles.css",
  // Remove or adjust icons if paths differ
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ===============================
// INSTALL — Cache core assets
// ===============================
self.addEventListener("install", event => {
  self.skipWaiting(); // activate immediately

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// ===============================
// ACTIVATE — Remove old caches
// ===============================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // take control immediately
});

// ===============================
// FETCH — Network first for HTML
// Cache first for static assets
// NEVER interfere with Apps Script backend
// ===============================
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // 1) Completely ignore Google Apps Script backend
  // Let the browser handle it as if no SW existed
  if (url.includes("script.google.com/macros")) {
    return; // no event.respondWith, no interception
  }

  // 2) HTML navigations → network first, fallback to cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 3) Static assets → cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful same-origin responses
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Optional: return nothing or a fallback for failed non-HTML requests
        return cached || Response.error();
      });
    })
  );
});
