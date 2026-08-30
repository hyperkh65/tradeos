'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** 서비스워커 등록 + "새 버전이 있습니다" 업데이트 배너를 함께 처리한다.
 * SW 등록 자체는 앱 전체(로그인 화면 포함)에서 이뤄져야 설치 가능성이 생기므로
 * 루트 레이아웃에 마운트한다. */
export function PwaManager() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    }).catch(() => { /* SW 등록 실패는 조용히 무시 — 일반 웹 사용에는 지장 없음 */ });

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  if (!waitingWorker) return null;

  const applyUpdate = () => {
    setApplying(true);
    waitingWorker.postMessage('SKIP_WAITING');
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-foreground text-background rounded-full shadow-lg px-4 py-2.5 flex items-center gap-3 text-sm">
      <span>새로운 버전이 있습니다.</span>
      <button onClick={applyUpdate} disabled={applying} className="font-semibold underline underline-offset-2 disabled:opacity-60 flex items-center gap-1.5">
        {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        업데이트
      </button>
    </div>
  );
}
