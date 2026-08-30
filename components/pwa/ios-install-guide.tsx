'use client';

import { X, Share2, SquarePlus, CheckCircle2, Smartphone } from 'lucide-react';

export const IOS_INSTALL_STEPS: { icon: React.ReactNode; text: string }[] = [
  { icon: <Smartphone className="w-4 h-4" />, text: 'Safari에서 YNK 그룹웨어 열기' },
  { icon: <Share2 className="w-4 h-4" />, text: '하단 공유 버튼 누르기' },
  { icon: <SquarePlus className="w-4 h-4" />, text: "'홈 화면에 추가' 선택" },
  { icon: <CheckCircle2 className="w-4 h-4" />, text: "'추가' 누르기" },
  { icon: <Smartphone className="w-4 h-4" />, text: '홈 화면의 YNK 아이콘 실행' },
];

export function IosInstallGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">iPhone/iPad에 YNK Groupware 설치</h3>
          <button onClick={onClose} aria-label="닫기"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {IOS_INSTALL_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {i + 1}
              </div>
              <span className="flex-1">{s.text}</span>
              <span className="text-muted-foreground shrink-0">{s.icon}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
