/* ===== PWA Service Worker =====
 * 策略：
 * - install: 预缓存所有核心静态资源（应用壳）
 * - fetch:
 *   - 同源导航请求：network-first（确保记录数据不回退到旧离线页，失败再fallback index.html）
 *   - 其他静态资源（CSS/JS/PNG/JPG/Manifest）：cache-first，加快加载并支持离线
 *   - 其他请求直接透传
 */
(function () {
  'use strict';

  const VERSION = 'v1.0.0';
  const CACHE_PREFIX = 'status-recorder-';
  const STATIC_CACHE = CACHE_PREFIX + 'static-' + VERSION;
  const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION;

  const PRECACHE_URLS = [
    './',
    './index.html',
    './settings.html',
    './history.html',
    './manifest.webmanifest',
    './styles.css',
    './app.js',
    './settings.js',
    './history.js',
    './icons/icon-72.png',
    './icons/icon-96.png',
    './icons/icon-128.png',
    './icons/icon-144.png',
    './icons/icon-152.png',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-384.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
  ];

  // ===== Install: 预缓存静态资源 =====
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' }))))
        .then(() => self.skipWaiting())
        .catch((err) => {
          console.warn('[SW] install pre-cache failed (non-fatal):', err);
          return self.skipWaiting();
        })
    );
  });

  // ===== Activate: 清理旧缓存 =====
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        ))
        .then(() => self.clients.claim())
    );
  });

  // ===== Helpers =====
  function sameOrigin(reqUrl) {
    try {
      return new URL(reqUrl, location.href).origin === location.origin;
    } catch (e) { return false; }
  }

  function isStaticAsset(reqUrl) {
    const lower = String(reqUrl).toLowerCase();
    return /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|webmanifest|json)$/i.test(lower);
  }

  function isNavigateRequest(request) {
    return request.mode === 'navigate' ||
      (request.method === 'GET' && request.headers.get('accept') &&
        request.headers.get('accept').includes('text/html'));
  }

  async function cacheFirst(request) {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    try {
      const resp = await fetch(request);
      if (resp && resp.ok && resp.type !== 'opaque') {
        const clone = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
      }
      return resp;
    } catch (e) {
      // 离线时静态资源找不到则尝试STATIC_CACHE忽略查询字符串
      const fallback = await caches.match(request, { ignoreSearch: true });
      if (fallback) return fallback;
      throw e;
    }
  }

  async function networkFirst(request, fallbackToShell) {
    try {
      const resp = await fetch(request);
      if (resp && resp.ok) {
        const clone = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
        return resp;
      }
    } catch (e) { /* offline */ }

    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackToShell) {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw new Error('offline and no cached data');
  }

  // ===== Fetch =====
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (!sameOrigin(req.url)) return; // 跨域不处理

    if (isNavigateRequest(req)) {
      // HTML导航：走network-first，失败回退缓存壳
      event.respondWith(networkFirst(req, true));
      return;
    }

    if (isStaticAsset(req.url)) {
      event.respondWith(cacheFirst(req));
      return;
    }

    // 其他请求（如果有）走默认
  });

  // ===== Skip Waiting on message (页面端可主动让新SW生效) =====
  self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
  });
})();
