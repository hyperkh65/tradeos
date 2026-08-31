'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrashedPhoto {
  id: string; originalFileName: string; status: string; deletedAt: string; deletedBy: string | null; uploadedByName: string;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });

/** 휴지통(요청서 33~37번) — 소프트 삭제된 사진 목록, 복원/영구삭제.
 * 일반 사용자는 본인이 삭제한(업로드한) 사진만, 관리자는 전체가 보인다(백엔드가 이미 필터링). */
export function TrashView({ isAdmin }: { isAdmin: boolean }) {
  const [photos, setPhotos] = useState<TrashedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<TrashedPhoto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/photos/trash');
      const data = await res.json();
      setPhotos(data.photos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (p: TrashedPhoto) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/photos/${p.id}/restore`, { method: 'POST' });
      if (res.ok) setPhotos(prev => prev.filter(x => x.id !== p.id));
    } finally {
      setBusyId(null);
    }
  };

  const permanentDelete = async (p: TrashedPhoto) => {
    setConfirmDelete(null);
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/photos/${p.id}/permanent`, { method: 'DELETE' });
      if (res.ok) setPhotos(prev => prev.filter(x => x.id !== p.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0 text-sm text-muted-foreground">
        휴지통 · {photos.length}장
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-2 text-muted-foreground">
            <Trash2 className="w-10 h-10" />
            <p className="text-sm">휴지통이 비어 있습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {photos.map(p => (
              <div key={p.id} className="rounded-lg border border-border overflow-hidden bg-muted/20">
                <div className="aspect-square bg-muted relative">
                  {p.status === 'ready' ? (
                    <img src={`/api/photos/${p.id}/media/thumb_medium`} alt={p.originalFileName} className="w-full h-full object-cover opacity-60" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="w-6 h-6" /></div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-xs truncate" title={p.originalFileName}>{p.originalFileName}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(p.deletedAt)} 삭제</p>
                  <div className="flex items-center gap-1 pt-1">
                    <button onClick={() => restore(p)} disabled={busyId === p.id}
                      className="flex-1 text-[11px] flex items-center justify-center gap-1 rounded-md border border-border py-1 hover:bg-muted disabled:opacity-50">
                      <RotateCcw className="w-3 h-3" />복원
                    </button>
                    {isAdmin && (
                      <button onClick={() => setConfirmDelete(p)} disabled={busyId === p.id}
                        className="flex-1 text-[11px] flex items-center justify-center gap-1 rounded-md border border-red-200 text-red-600 py-1 hover:bg-red-50 disabled:opacity-50">
                        <Trash2 className="w-3 h-3" />영구삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-2">영구삭제 확인</h3>
            <p className="text-xs text-muted-foreground mb-4">
              &quot;{confirmDelete.originalFileName}&quot;을(를) 영구삭제합니다. 원본 파일과 모든 연결(태그·댓글·업무연결·공유)이 함께 삭제되며 복구할 수 없습니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className={cn('text-xs px-3 py-1.5 rounded-md border border-border')}>취소</button>
              <button onClick={() => permanentDelete(confirmDelete)} className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700">영구삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
