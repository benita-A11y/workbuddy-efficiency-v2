// Service Worker - 纯离线运行（v24：今日宜忌首页卡片入口改为多重兜底内联写法，不再依赖任一单一全局函数；新增 debug-almanac.html 诊断页；强制刷新旧缓存）
const CACHE_NAME = 'efficiency-app-v24';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/inspiration.css',
  './js/storage.js',
  './js/app.js',
  './js/quotes.js',
  './js/inspiration-db.js',
  './js/inspiration.js',
  './js/almanac.js',
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
  // 只缓存同源 GET 请求
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 有缓存就用缓存，同时后台更新
      if (cached) {
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
        }).catch(() => {});
        return cached;
      }
      // 无缓存，从网络获取
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 离线且无缓存时返回主页
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
