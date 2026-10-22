// ============================================================
// ZorWel Service Worker — v3.0
// Estrategia: Cache-First para el shell, Network-First para datos
// ============================================================

const CACHE_VERSION = 'zorwel-v3.5';

// 🏠 APP SHELL: archivos propios que SÍ podemos cachear
const APP_SHELL = [
    '/',
    '/index.html',
    '/app.js',
    '/analisis.html',
    '/analisis.js',
    '/style.css',
    '/manifest.json',
    '/exito.html',
    '/images/icono-192.png',
    '/images/icono-512.png',
];

// 🌐 CDN externos que cacheamos la primera vez que se descargan
// (No los pre-cacheamos en install porque fallaría si hay 1 solo error de red)
const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
];

// 🔥 Firebase: sus módulos JS los cacheamos, sus llamadas a datos NO
const FIREBASE_JS_HOST = 'www.gstatic.com';

// Requests a Firestore/Auth API — nunca se cachean, son datos en tiempo real
const NEVER_CACHE = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebase.googleapis.com',
];

// ─────────────────────────────────────────
// 1. INSTALL — cachea el App Shell
// ─────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[ZorWel SW] Instalando versión:', CACHE_VERSION);

    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            // addAll falla si UNO solo falla — usamos add individual para ser resilientes
            const promesas = APP_SHELL.map((url) =>
                cache.add(url).catch((err) => {
                    console.warn('[ZorWel SW] No se pudo cachear:', url, err.message);
                })
            );
            return Promise.all(promesas);
        }).then(() => {
            console.log('[ZorWel SW] App Shell cacheado ✅');
            return self.skipWaiting();
        })
    );
});

// ─────────────────────────────────────────
// 2. ACTIVATE — limpia cachés viejos
// ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log('[ZorWel SW] Activado. Limpiando cachés anteriores...');

    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_VERSION) {
                        console.log('[ZorWel SW] Eliminando caché vieja:', key);
                        return caches.delete(key);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

// ─────────────────────────────────────────
// 3. FETCH — el núcleo del offline
// ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // ── Ignorar peticiones no HTTP (extensiones, blob:, etc.) ──
    if (!event.request.url.startsWith('http')) return;

    // ── Ignorar métodos que no sean GET (POST a Firestore, etc.) ──
    if (event.request.method !== 'GET') return;

    // ── REGLA 1: Firestore/Auth API → NUNCA cachear, siempre red ──
    // Si no hay red, Firestore usará su propia caché interna (IndexedDB)
    if (NEVER_CACHE.some((host) => url.hostname.includes(host))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // ── REGLA 2: App Shell propio → Cache First ──
    // Carga instantánea offline. Cuando hay red, actualiza en background.
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirstConActualizacion(event.request));
        return;
    }

    // ── REGLA 3: Firebase JS (gstatic.com) y CDNs → Cache First ──
    // Los módulos de Firebase, Tailwind, Chart.js, etc.
    // Una vez descargados, funcionan sin internet indefinidamente.
    if (
        url.hostname === FIREBASE_JS_HOST ||
        CDN_HOSTS.some((host) => url.hostname.includes(host))
    ) {
        event.respondWith(cacheFirstConActualizacion(event.request));
        return;
    }

    // ── REGLA 4: Todo lo demás → Network First con fallback ──
    event.respondWith(networkFirstConFallback(event.request));
});

// ─────────────────────────────────────────
// ESTRATEGIAS
// ─────────────────────────────────────────

/**
 * Cache First con actualización silenciosa en background.
 * → Respuesta instantánea offline. Actualiza la caché cuando hay red.
 */
async function cacheFirstConActualizacion(request) {
    const cached = await caches.match(request);

    // Lanzamos la actualización en background sin bloquear la respuesta
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_VERSION).then((cache) =>
                    cache.put(request, networkResponse.clone())
                );
            }
            return networkResponse;
        })
        .catch(() => null);

    // Si está en caché, devolvemos eso ya. Si no, esperamos la red.
    return cached || fetchPromise;
}

/**
 * Network First con fallback a caché.
 * → Intenta la red. Si falla, sirve desde caché.
 */
async function networkFirstConFallback(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback final: si es una navegación (abrir la app), servimos index.html
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        return new Response('Sin conexión y sin caché disponible.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}
