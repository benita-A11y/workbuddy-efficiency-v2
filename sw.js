// Service Worker - 缓存优先 +后台静默更新（SWR），进 app 秒开（v53：quotes.js 注释层面的第三方域名引用全部清除，文件 100% 本地无网络；继承 v52 独立页预缓存 + v51 SWR + v50/v49/v48。）
const CACHE_NAME = 'efficiency-app-v53';
const ASSETS = [
  './',
  './index.html',
  './inspiration.html',
  './inspiration-detail.html',
  './inspiration-edit.html',
  './finance.html',
  './css/style.css',
  './css/inspiration.css',
  './css/finance.css',
  './js/storage.js',
  './js/app.js',
  './js/checkin.js',
  './js/quotes.js',
  './js/theme-apply.js',
  './js/inspiration-db.js',
  './js/inspiration.js',
  './js/inspiration-detail.js',
  './js/inspiration-edit.js',
  './js/finance.js',
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

  // Stale-While-Revalidate：命中缓存立即返回（秒开），同时后台拉取最新写回缓存
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      const cached = cache.match(event.request);
      const fetched = fetch(event.request)
        .then((response) => {
          // 仅缓存同源成功响应，避免污染缓存
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'default')) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      return cached.then((c) => {
        if (c) return c; // 命中：立即返回，fetched 仍在后台更新缓存
        // 未命中：等网络；失败则回退首页
        return fetched.then((resp) =>
          resp || cache.match('./index.html').then((f) => f || cache.match('./'))
        );
      });
    })
  );
});
