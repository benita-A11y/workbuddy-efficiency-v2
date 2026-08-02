// Service Worker - 离线优先但导航走网络优先（v35：根治“改了样式刷新看不到”——
// 对非导航静态资源(css/js/数据/图标)由 cache-first 改为 NETWORK-FIRST + cache:'reload'，
// 绕过 GitHub Pages 的 10 分钟 HTTP 缓存，保证用户每次刷新都拿到服务器最新文件；
// 仅网络不可用时退回缓存，维持离线可用。注册端加 updateViaCache:'none' 让 SW 自身及时更新。）
const CACHE_NAME = 'efficiency-app-v35';
const ASSETS = [
  './',
  './index.html',
  './inspiration.html',
  './inspiration-detail.html',
  './inspiration-edit.html',
  './css/style.css',
  './css/inspiration.css',
  './js/storage.js',
  './js/app.js',
  './js/quotes.js',
  './js/inspiration-db.js',
  './js/inspiration.js',
  './js/almanac.js',
  './js/auspicious.js',
  './almanac-data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 逐个缓存，单个资源失败不影响整体安装（提升热更新稳定性）
      return Promise.all(
        ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 只处理同源 GET
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求（HTML 页面）：NETWORK-FIRST —— 永远先拿最新页面，失败再退回缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 其它静态资源（css/js/数据/图标）：NETWORK-FIRST + 绕过 HTTP 缓存
  // 保证用户每次刷新都拿到服务器最新文件（彻底解决“改了样式刷新看不到”的缓存问题）；
  // 仅当网络不可用时才退回缓存，保证离线可用。
  event.respondWith(
    fetch(event.request, { cache: 'reload' })
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
