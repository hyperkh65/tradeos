'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { Download, MoreVertical, CheckCircle2 } from 'lucide-react';

export default function InstallAndroidPage() {
  const { canPromptInstall, promptInstall, isStandalone } = usePwaInstall();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="Android에 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-lg mx-auto w-full space-y-5">
        <h1 className="text-lg font-semibold">Android에 YNK Groupware 설치</h1>

        {isStandalone ? (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            이미 앱으로 설치되어 실행 중입니다.
          </div>
        ) : canPromptInstall ? (
          <Button size="lg" className="w-full gap-2" onClick={() => promptInstall()}>
            <Download className="w-4 h-4" />
            앱 설치
          </Button>
        ) : (
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              이 브라우저에서는 설치 버튼을 바로 띄울 수 없습니다. 아래 방법으로 직접 설치해주세요.
            </p>
            <div className="flex items-start gap-3 text-sm">
              <MoreVertical className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>브라우저 메뉴(⋮)에서 <b>&quot;앱 설치&quot;</b> 또는 <b>&quot;홈 화면에 추가&quot;</b> 선택</span>
            </div>
            <p className="text-xs text-muted-foreground">
              기종·브라우저(Chrome/Samsung Internet 등)에 따라 메뉴 이름이 다를 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
