'use client';

import { AppHeader } from '@/components/layout/header';
import { Smartphone, Tablet, Monitor, Apple, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import Link from 'next/link';

const CARDS = [
  { key: 'android', label: 'Android', method: 'PWA', href: '/install/android', icon: Smartphone },
  { key: 'ios', label: 'iPhone/iPad', method: 'PWA', href: '/install/ios', icon: Tablet },
  { key: 'windows', label: 'Windows', method: 'Tauri', href: '/install/windows', icon: Monitor },
  { key: 'macos', label: 'macOS', method: 'Tauri', href: '/install/macos', icon: Apple },
] as const;

export default function InstallCenterPage() {
  const { platform, isStandalone } = usePwaInstall();
  const [detected, setDetected] = useState<typeof CARDS[number] | null>(null);

  useEffect(() => {
    setDetected(CARDS.find((c) => c.key === platform) ?? null);
  }, [platform]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="앱 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-3xl mx-auto w-full">
        {isStandalone ? (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            이미 앱으로 설치되어 실행 중입니다.
          </div>
        ) : detected ? (
          <div className="border border-primary/30 bg-primary/5 rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-1">현재 기기 감지됨</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <detected.icon className="w-5 h-5 text-primary" />
                <span className="font-semibold">{detected.label}에 YNK Groupware 설치</span>
              </div>
              <Link href={detected.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                바로가기 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">전체 플랫폼</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CARDS.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className={cn(
                  'border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/50 hover:bg-muted/40 transition-colors',
                  detected?.key === c.key && 'border-primary/50 bg-primary/5'
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <c.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{c.label}</p>
                  <p className="text-xs text-muted-foreground">설치 방식: {c.method}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
