// アプリ本体だけをキャッシュする。教材データは IndexedDB にあるため対象外。
// アプリのファイルを更新したら CACHE の版番号を上げること。

const CACHE = 'pfs-v1';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/lib/book.js',
  'js/lib/db.js',
  'js/lib/html.js',
  'js/lib/progress.js',
  'js/lib/quizpick.js',
  'js/lib/quizresults.js',
  'js/lib/schema.js',
  'js/lib/sentences.js',
  'js/lib/settings.js',
  'js/lib/speech.js',
  'js/lib/wakelock.js',
  'js/views/onboarding.js',
  'js/views/player.js',
  'js/views/quiz.js',
  'js/views/settings.js',
  'js/views/toc.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // キャッシュを先に返し、裏で更新する。オフラインでも即座に起動できる。
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { /* キャッシュ書き込み失敗は無視 */ });
          }
          return res;
        })
        .catch(err => {
          // キャッシュにもネットワークにも無い場合、undefined を返すのではなくエラーを投げ直す。
          // そうしないと respondWith に undefined で解決する Promise を渡すことになり、仕様違反。
          if (hit) return hit;
          throw err;
        });
      return hit || net;
    })
  );
});
