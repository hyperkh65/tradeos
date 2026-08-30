'use client';

import { useCallback, useEffect, useState } from 'react';

/** 표준 타입 정의에 아직 없는 브라우저 전용 이벤트(Chrome/Edge 계열만 발생). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type DetectedPlatform = 'ios' | 'android' | 'windows' | 'macos' | 'other';

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // iPadOS 13+는 데스크톱 Safari로 위장해서 UA에 iPad가 안 남는다 — 터치 지원 여부로 추가 판별.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Win/.test(ua)) return 'windows';
  if (/Mac/.test(ua)) return 'macos';
  return 'other';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // navigator.standalone은 iOS Safari 전용 비표준 속성이라 타입에 없음.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

/** Android/Chrome(beforeinstallprompt)와 iOS(수동 안내)를 모두 다루는 설치 상태 훅.
 * 이미 설치되어 standalone으로 실행 중이면 isStandalone=true — 호출부에서 배너/버튼을 숨기는 데 쓴다. */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<DetectedPlatform>('other');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsStandalone(detectStandalone());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setDeferredPrompt(null); setIsStandalone(true); };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!deferredPrompt) return null;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  return { platform, isStandalone, canPromptInstall: !!deferredPrompt, promptInstall };
}
