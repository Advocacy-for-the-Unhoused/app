const CACHE_NAME = "afu-cache-v5";
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json"
  // Remove the icon references for now since they might not exist
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.error("Cache addAll failed:", err);
        // Still complete installation even if caching fails
        return Promise.resolve();
      });
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = event.request.url;
  
  // Don't cache Google APIs or Scripts
  if (url.includes("script.google.com") || 
      url.includes("accounts.google.com") || 
      url.includes("gsi/client")) {
    return;
  }
  
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
