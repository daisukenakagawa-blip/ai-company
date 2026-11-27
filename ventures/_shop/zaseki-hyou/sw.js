// 店のアプリ（Microsoft Store の PWA）用の最小限の service worker。
// 何も保存しない・通信に手を加えない（fetch では respondWith を呼ばず、ブラウザの通常の処理に任せる）。
// 製品版の鍵（Cookie の確認）・決済・計測には一切関与しない
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
