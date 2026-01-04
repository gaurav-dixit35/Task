const CACHE_NAME = "task-app-v1";
const urlsToCache = [
  "index.html",
  "style.css",
  "script.js",
  "firebase.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open("karya-cache-v1").then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
      );
    })
  );
});
