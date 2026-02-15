// ===============================
// AFU LOGGER — SERVICE WORKER
// Modern, safe, no stale cache
// ===============================

const CACHE_NAME = "afu-cache-v3";   // bump version to force update

// Only cache LOCAL assets — NEVER external URLs
const ASSETS = [
  "/",               // root
  "/index.html",
  "/app.js",
  "/manifest.json",
  "/styles.css",     // if you have one
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
// NEVER cache Google Script URLs
// ===============================
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Do NOT cache Google Apps Script backend
  if (url.includes("script.google.com/macros")) {
    return; // let it hit the network directly
  }

  // HTML → network first (prevents stale UI)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets → cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return (
        cached ||
        fetch(event.request).then(response => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
      );
    })
  );
});
