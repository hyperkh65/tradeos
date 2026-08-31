'use client';

import { AppHeader } from '@/components/layout/header';
import { ReleaseDownloadCard } from '@/components/desktop/release-download-card';

const STEPS = [
  '위 버튼으로 설치파일(.dmg)을 내려받습니다.',
  '내려받은 .dmg 파일을 더블클릭해 마운트합니다.',
  '열린 창에서 YNK Groupware 아이콘을 Applications 폴더로 드래그합니다.',
  '처음 실행할 때 "확인되지 않은 개발자" 경고가 뜨면, 앱 아이콘을 우클릭(또는 Control+클릭) 후 "열기"를 선택합니다 — 이후에는 정상적으로 더블클릭으로 실행됩니다(서명·공증 인증서가 없어서 뜨는 정상적인 경고입니다).',
];

export default function InstallMacosPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="Mac에 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-lg mx-auto w-full space-y-5">
        <h1 className="text-lg font-semibold">YNK Groupware for Mac</h1>

        <ReleaseDownloadCard platform="macos" />

        <div>
          <p className="text-sm font-semibold mb-3">설치 방법</p>
          <div className="border border-border rounded-xl p-5 space-y-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                  {i + 1}
                </div>
                <span className="flex-1 pt-0.5">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
