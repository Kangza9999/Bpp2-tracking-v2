/**
 * Service Worker — bpp2-tracking v3.0
 * Cache Strategy: Network-first for API, Cache-first for assets
 */
const CACHE_NAME = "bpp2-v3.0";
const STATIC_ASSETS = ["/", "/index.html", "/css/style.css", "/js/app.js"];

self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", e => {
    const url = new URL(e.request.url);
    if (url.href.includes("script.google.com")) return;
    
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
            if (res.ok && e.request.method === "GET") {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
            }
            return res;
        })).catch(() => caches.match("/index.html"))
    );
});
