// Service worker: rende il sito installabile e più veloce.
// - Pagine: prima la rete (sempre aggiornate), se offline l'ultima copia.
// - File statici (JS/CSS/font/icone): dalla cache.
// - Database e funzioni (Supabase): MAI in cache, i dati sono sempre freschi.
const VERSIONE = "sole-v3";
// Cartella del sito (es. "/sole/" su GitHub Pages): tutti i percorsi partono da qui.
const BASE = new URL(self.registration.scope).pathname;
const inBase = (p) => BASE + String(p).replace(/^\//, "");
const CACHE_STATICI = `${VERSIONE}-statici`;
const CACHE_PAGINE = `${VERSIONE}-pagine`;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_PAGINE).then((c) => c.addAll([BASE])));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const nomi = await caches.keys();
      await Promise.all(nomi.filter((n) => !n.startsWith(VERSIONE)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function primaLaRete(req) {
  const cache = await caches.open(CACHE_PAGINE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || (await cache.match(BASE)) || Response.error();
  }
}

async function primaLaCache(req) {
  const cache = await caches.open(CACHE_STATICI);
  const trovato = await cache.match(req);
  if (trovato) return trovato;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e altri servizi: sempre rete

  if (req.mode === "navigate") {
    e.respondWith(primaLaRete(req));
    return;
  }
  if (url.pathname.startsWith(inBase("_next/static/")) || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    e.respondWith(primaLaCache(req));
  }
});

// ---- Notifiche push ----
self.addEventListener("push", (e) => {
  let dati = { titolo: "Analizzatore H24", corpo: "", url: BASE };
  try {
    dati = { ...dati, ...e.data.json() };
  } catch (err) {
    if (e.data) dati.corpo = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(dati.titolo, {
      body: dati.corpo,
      icon: inBase("icons/icon-192.png"),
      badge: inBase("icons/favicon-32.png"),
      data: { url: dati.url || BASE },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // le notifiche mandano percorsi tipo "/asset/XAUUSD/": li porto dentro la cartella del sito
  const dest = (e.notification.data && e.notification.data.url) || BASE;
  const url = new URL(dest.startsWith(BASE) ? dest : inBase(dest), self.location.origin).href;
  e.waitUntil(
    (async () => {
      const finestre = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const f of finestre) {
        if ("focus" in f) {
          await f.focus();
          if ("navigate" in f) {
            try {
              await f.navigate(url);
            } catch (err) {}
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
