const CACHE_NAME = "karya-v8";
const urlsToCache = [
  "index.html",
  "style.css",
  "script.js",
  "task-utils.js",
  "Karyaai/ai.js",
  "Karyaai/ai.css",
  "Karyaai/online-brain.js",
  "Karyaai/ai-brain.js",
  "firebase.js",
  "login.html",
  "login.js",
  "settings.html",
  "set.js",
  "set.css",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/logo.png",
  "icons/karyaai.png",
  "sounds/default.mp3",
  "sounds/ding.mp3",
  "sounds/bell.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).then(() => self.skipWaiting());
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() =>
            event.request.mode === "navigate"
              ? caches.match("index.html")
              : new Response("Offline", { status: 503, statusText: "Offline" })
          )
      );
    })
  );
});
