/* ===== PWA Service Worker (Mobile Optimized) =====
 * 移动端性能优化：
 *   1) 启用 NavigationPreload（iOS 16.4+ / Safari 16.4+ 已支持），首次导航与SW启动并行，减少冷启动等待
 *   2) HTML 导航请求：Stale-While-Revalidate。启动快（秒级命中缓存），后台静默更新下次生效，避免"等网络"的白屏
 *   3) 静态资源(CSS/JS/PNG/Manifest)：cache-first，首次之后零网络；缓存名绑定 VERSION 保证新版本自动全清
 *   4) skipWaiting + clients.claim：新版本发布后一键升级，不要求用户手动关标签页
 *   5) 白名单匹配同源 GET；其他请求直接透传（不拦截 fetch），避免主线程阻塞
 */
(function () {
  'use strict';

  const VERSION = 'v1.7.0-refresh-fix';
  const CACHE_PREFIX = 'status-recorder-';
  const STATIC_CACHE = CACHE_PREFIX + 'static-' + VERSION;
  const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION;
  const HTML_CACHE = CACHE_PREFIX + 'html-' + VERSION;

  const PRECACHE_URLS = [
    './',
    './index.html',
    './settings.html',
    './history.html',
    './manifest.webmanifest',
    './styles.css',
    './app.js',
    './settings.js',
    './history.js'
  ];

  const PRECACHE_ICONS = [
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
  ];

  // ===== Install: 预缓存关键壳资源 + 3 张常用图标 =====
  self.addEventListener('install', (event) => {
    const all = PRECACHE_URLS.concat(PRECACHE_ICONS);
    event.waitUntil(
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(all.map(u => new Request(u, { cache: 'reload' }))))
        .then(() => self.skipWaiting())
        .catch((err) => {
          console.warn('[SW] install pre-cache partial failed (non-fatal):', err);
          // 即使某图标 404 也要继续 activate 主流程
          return self.skipWaiting();
        })
    );
  });

  // ===== Activate: 清理旧缓存 + NavigationPreload =====
  self.addEventListener('activate', (event) => {
    const cleanup = caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) &&
            k !== STATIC_CACHE && k !== RUNTIME_CACHE && k !== HTML_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim());

    // 启用 NavigationPreload（iOS 16.4+ / Safari 16.4+ 已支持）；不支持的浏览器 catch 后静默跳过
    if (self.registration && self.registration.navigationPreload) {
      event.waitUntil(
        Promise.all([
          cleanup,
          self.registration.navigationPreload.enable().then(() => {}).catch(() => {})
        ])
      );
    } else {
      event.waitUntil(cleanup);
    }
  });

  // ===== Helpers =====
  function sameOrigin(reqUrl) {
    try {
      return new URL(reqUrl, location.href).origin === location.origin;
    } catch (e) { return false; }
  }

  function isStaticAsset(reqUrl) {
    const lower = String(reqUrl).toLowerCase();
    return /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|webmanifest)$/i.test(lower);
  }

  function isHtmlNavigate(request) {
    if (request.mode === 'navigate') return true;
    if (request.method !== 'GET') return false;
    const accept = request.headers.get('accept') || '';
    if (!accept.includes('text/html')) return false;
    // /index.html 或带 / 结尾路径 也视为导航
    const u = new URL(request.url, location.href);
    const p = u.pathname;
    return p.endsWith('.html') || p.endsWith('/') || p === '/' || p === '';
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
      const fallback = await caches.match(request, { ignoreSearch: true });
      if (fallback) return fallback;
      throw e;
    }
  }

  // HTML 导航：Stale-While-Revalidate（优先返回缓存 -> 后台静默更新）
  async function staleWhileRevalidateHtml(request, preloadResponsePromise) {
    // 先看缓存（命中立即返回）
    const cachedHtml = await caches.match(request, { ignoreSearch: true });

    // 若有 NavigationPreload 结果，优先用它作为后台 fetch，减少一次 TCP+TLS
    let networkPromise = (preloadResponsePromise && Promise.resolve(preloadResponsePromise).then(r => r || null)) || null;
    if (!networkPromise) {
      networkPromise = (async () => {
        try { return await fetch(request); } catch (e) { return null; }
      })();
    }

    const updateCache = networkPromise.then((resp) => {
      if (resp && resp.ok && resp.type !== 'opaque') {
        const clone = resp.clone();
        caches.open(HTML_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => null);

    if (cachedHtml) {
      // 缓存命中：立刻返回缓存，后台 updateCache 继续跑
      updateCache.then(() => {});
      return cachedHtml;
    }

    // 缓存未命中（首次启动）：等 updateCache 返回
    const fresh = await updateCache;
    if (fresh) return fresh;
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    throw new Error('[SW] offline and no cached HTML shell');
  }

  // ===== Fetch =====
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (!sameOrigin(req.url)) return;

    // HTML 导航（含子页 settings.html / history.html / 首页根路径）
    if (isHtmlNavigate(req)) {
      const preload = event.preloadResponse; // 可能是 Promise<Response | undefined>
      event.respondWith(staleWhileRevalidateHtml(req, preload));
      return;
    }

    if (isStaticAsset(req.url)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    // 其他（理论上无）走默认
  });

  // ===== Message: SKIP_WAITING + 主动清空 HTML_CACHE（调试/强刷用）=====
  self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
      try { self.skipWaiting(); } catch (e) {}
    } else if (event.data === 'CLEAR_HTML_CACHE') {
      event.waitUntil(caches.delete(HTML_CACHE).catch(() => {}));
    }
  });
})();
