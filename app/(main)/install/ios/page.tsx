'use client';

import { AppHeader } from '@/components/layout/header';
import { IOS_INSTALL_STEPS } from '@/components/pwa/ios-install-guide';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { CheckCircle2 } from 'lucide-react';

export default function InstallIosPage() {
  const { isStandalone } = usePwaInstall();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="iPhone/iPad에 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-lg mx-auto w-full space-y-5">
        <h1 className="text-lg font-semibold">iPhone/iPad에 YNK Groupware 설치</h1>

        {isStandalone && (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            이미 앱으로 설치되어 실행 중입니다.
          </div>
        )}

        <div className="border border-border rounded-xl p-5 space-y-5">
          {IOS_INSTALL_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
                {i + 1}
              </div>
              <span className="flex-1">{s.text}</span>
              <span className="text-muted-foreground shrink-0">{s.icon}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">반드시 Safari에서 진행해주세요 — Chrome 등 다른 브라우저는 홈 화면 추가를 지원하지 않을 수 있습니다.</p>
      </div>
    </div>
  );
}
