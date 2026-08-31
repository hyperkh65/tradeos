'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, X, Smartphone, Monitor, Apple } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';

const DISMISS_KEY = 'ynk-install-banner-dismissed';

const PLATFORM_LINKS = [
  { href: '/install/android', label: 'Android', icon: Smartphone },
  { href: '/install/ios', label: 'iPhone/iPad', icon: Smartphone },
  { href: '/install/windows', label: 'Windows', icon: Monitor },
  { href: '/install/macos', label: 'Mac', icon: Apple },
];

export function InstallBanner() {
  const { isStandalone } = usePwaInstall();
  const [isTauri, setIsTauri] = useState(false);
  const [dismissed, setDismissed] = useState(true); // 초기값 true — 조건 확인 전 깜빡임 방지

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI__' in window);
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (isStandalone || isTauri || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="border border-primary/20 bg-primary/5 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
      <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-semibold">YNK 그룹웨어를 앱으로 설치해보세요</p>
        <p className="text-xs text-muted-foreground mt-0.5">더 빠른 실행, 더 넓은 화면으로 이용할 수 있습니다.</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {PLATFORM_LINKS.map(p => (
          <Link
            key={p.href}
            href={p.href}
            className="flex items-center gap-1.5 text-xs font-medium bg-background border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors"
          >
            <p.icon className="w-3.5 h-3.5" />
            {p.label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
