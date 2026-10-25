/* Service worker: ให้เปิดแอปได้แม้ไม่มีเน็ต
 * ไฟล์ของแอป  → ลองโหลดใหม่จากเน็ตก่อน (ได้ของใหม่เสมอหลังอัปเดตบน GitHub) ถ้าไม่มีเน็ตค่อยใช้ของที่เก็บไว้
 * ฟอนต์ Google → เก็บไว้ใช้ซ้ำ
 * ข้อมูลที่จดไว้อยู่ใน localStorage ไม่เกี่ยวกับไฟล์นี้
 */
const CACHE = 'driver-ledger-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'logic.js', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
    );
  } else if (/(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
