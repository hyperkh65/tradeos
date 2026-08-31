'use client';

import { AppHeader } from '@/components/layout/header';
import { ReleaseDownloadCard } from '@/components/desktop/release-download-card';

const STEPS = [
  '위 버튼으로 설치파일(.exe)을 내려받습니다.',
  '내려받은 파일을 더블클릭해 실행합니다.',
  '"Windows에서 PC를 보호했습니다" SmartScreen 경고가 뜨면 "추가 정보" → "실행"을 누릅니다(서명 인증서가 없어서 뜨는 정상적인 경고입니다).',
  '설치 마법사의 안내를 따라 설치를 마치면 바탕화면/시작 메뉴에서 YNK 그룹웨어를 실행할 수 있습니다.',
];

export default function InstallWindowsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="Windows에 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-lg mx-auto w-full space-y-5">
        <h1 className="text-lg font-semibold">YNK Groupware for Windows</h1>

        <ReleaseDownloadCard platform="windows" />

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
