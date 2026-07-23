/*==================================
 LinkVault V2
 Service Worker
==================================*/

const CACHE_NAME = "linkvault-v3";

const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/kofi-badge.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install
self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)

      .then(cache => {

        return cache.addAll(FILES);

      })

  );

});

// Activate
self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys.map(key => {

          if (key !== CACHE_NAME) {

            return caches.delete(key);

          }

        })

      );

    })

  );

});

// Fetch

self.addEventListener("fetch", event => {

  event.respondWith(

    fetch(event.request)

      .then(networkResponse => {

        // Update the cache with the fresh version in the background
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));

        return networkResponse;

      })

      .catch(() => {

        // Offline fallback: use whatever was cached
        return caches.match(event.request);

      })

  );

});