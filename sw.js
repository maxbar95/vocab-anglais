// =====================================================
//  Mode hors-ligne de l'appli
//  Avec internet : le site est toujours chargé en ligne (les nouveaux mots arrivent tout de suite)
//  et une copie est gardée sur l'appareil.
//  Sans internet : on utilise cette copie.
// =====================================================

const CACHE = "pingpong-vocab-v1";

const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "progression.js",
  "mots.js",
  "robot.js",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

// Première visite : on met une copie du site de côté
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)));
  self.skipWaiting();
});

// On jette les anciennes copies si le nom du CACHE change
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const police = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !police) return;

  e.respondWith(
    // 1) On essaie internet, et on met à jour la copie
    fetch(req)
      .then((reponse) => {
        if (reponse.ok || reponse.type === "opaque") {
          const copie = reponse.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return reponse;
      })
      // 2) Pas d'internet : on prend la copie
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((enCache) =>
          enCache || (req.mode === "navigate" ? caches.match("./") : Response.error())
        )
      )
  );
});
