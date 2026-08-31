'use client';

import { AppHeader } from '@/components/layout/header';
import { Images } from 'lucide-react';

/**
 * Phase 1 뼈대 — DB/저장소/권한/메뉴 배선만 확인하는 자리표시자.
 * 실제 폴더 트리/그리드/업로드 UI는 Phase 3~4에서 채운다.
 */
export default function PhotosPage() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <AppHeader title="사진첩" />
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Images className="w-10 h-10" />
        <p className="text-sm">사진첩 기능을 준비 중입니다.</p>
      </div>
    </div>
  );
}
