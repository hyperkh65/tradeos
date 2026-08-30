// PWA 설치성(installability)을 위한 최소 서비스워커 — 오프라인 앱이 아니다.
// 정적 셸 자산(아이콘/매니페스트)만 캐시하고, 페이지/API 요청은 전부 네트워크로
// 그대로 통과시킨다(업무 데이터를 낡은 캐시로 보여주는 위험을 원천 차단).
const SW_VERSION = 'v1'; // 배포마다 이 값만 바꾸면 새 버전으로 인식되어 업데이트 배너가 뜬다.
const CACHE_NAME = `ynk-shell-${SW_VERSION}`;
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  // 여기서 skipWaiting()을 자동 호출하지 않는다 — 사용자가 업데이트 배너에서 직접
  // 눌러야 새 워커가 활성화되게 해서, 작업 중인 화면이 갑자기 새로고침되지 않게 한다.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
  // 그 외 모든 요청(페이지/API)은 가로채지 않는다 — 브라우저 기본 네트워크 요청 그대로.
});
