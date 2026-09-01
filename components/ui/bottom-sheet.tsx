'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/** 모바일 전용 하단 시트 — 화면 하단에서 올라오는 오버레이 패널. safe-area(노치/홈바)를
 * 자동으로 피하고, 배경 클릭/X 버튼으로 닫힌다. PWA/Tauri 전화면 모드에서도 잘리지 않도록
 * env(safe-area-inset-bottom)을 패딩으로 반영한다. */
export function BottomSheet({ onClose, title, children, className }: BottomSheetProps) {
  return (
    <div className="fixed inset-0 z-[85] md:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn('absolute inset-x-0 bottom-0 bg-background rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col', className)}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-border">
            <span className="text-sm font-semibold">{title}</span>
            <button onClick={onClose} className="p-1 -m-1"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
