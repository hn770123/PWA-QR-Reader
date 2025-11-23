/**
 * Service Worker - オフライン対応とキャッシュ管理
 * PWAの中核機能を提供
 */

const CACHE_NAME = 'qr-reader-v1';
const urlsToCache = [
  '/PWA-QR-Reader/',
  '/PWA-QR-Reader/index.html',
  '/PWA-QR-Reader/styles.css',
  '/PWA-QR-Reader/app.js',
  '/PWA-QR-Reader/manifest.json',
  '/PWA-QR-Reader/icon-192.png',
  '/PWA-QR-Reader/icon-512.png'
];

/**
 * インストール時の処理
 * 必要なファイルをキャッシュに保存
 */
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: ファイルをキャッシュ中...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: キャッシュ完了');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: キャッシュエラー:', error);
      })
  );
});

/**
 * アクティベート時の処理
 * 古いキャッシュを削除
 */
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティベート中...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: アクティベート完了');
      return self.clients.claim();
    })
  );
});

/**
 * フェッチ時の処理
 * キャッシュファーストストラテジー
 */
self.addEventListener('fetch', event => {
  // jsQR CDNのリクエストは常にネットワークから取得
  if (event.request.url.startsWith('https://cdn.jsdelivr.net/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('オフラインです。jsQRライブラリを読み込めません。', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにある場合はそれを返す
        if (response) {
          return response;
        }

        // キャッシュにない場合はネットワークから取得
        return fetch(event.request).then(response => {
          // 有効なレスポンスかチェック
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // レスポンスをキャッシュに保存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
      .catch(error => {
        console.error('Service Worker: フェッチエラー:', error);
        // オフライン時のフォールバック
        return new Response('オフラインです', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});
