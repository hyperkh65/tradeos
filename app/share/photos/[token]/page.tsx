'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Lock, Loader2, Download, X, ChevronLeft, ChevronRight, ImageIcon, AlertTriangle } from 'lucide-react';

interface SharedPhoto { id: string; originalFileName: string; title: string | null; status: string; width: number | null; height: number | null }

export default function PhotoSharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(false);
  const [photos, setPhotos] = useState<SharedPhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/photos/${token}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || '링크를 불러올 수 없습니다');
        return;
      }
      const data = await res.json();
      if (data.needsPassword) {
        setNeedsPassword(true);
        setTitle(data.title);
      } else {
        setNeedsPassword(false);
        setTitle(data.title);
        setMessage(data.message);
        setAllowDownload(data.allowDownload);
        setAllowOriginalDownload(data.allowOriginalDownload);
        setPhotos(data.photos || []);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const unlock = async () => {
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await fetch(`/api/share/photos/${token}/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setUnlockError(j.error || '비밀번호가 올바르지 않습니다');
        return;
      }
      await load();
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-muted/20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <div className="bg-background rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="font-semibold mb-1">공유 링크 오류</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <div className="bg-background rounded-xl shadow-lg p-8 max-w-sm w-full">
          <Lock className="w-8 h-8 text-primary mx-auto mb-3" />
          <h1 className="font-semibold text-center mb-1">{title || '비밀번호로 보호된 사진첩'}</h1>
          <p className="text-xs text-muted-foreground text-center mb-4">비밀번호를 입력하세요</p>
          <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') unlock(); }}
            className="w-full h-10 text-sm border border-border rounded-md px-3 bg-background mb-2" placeholder="비밀번호" autoFocus />
          {unlockError && <p className="text-xs text-red-500 mb-2">{unlockError}</p>}
          <button onClick={unlock} disabled={unlocking || !passwordInput}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
            {unlocking && <Loader2 className="w-4 h-4 animate-spin" />}확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10">
      <div className="border-b border-border bg-background px-4 py-4">
        <h1 className="font-semibold text-lg">{title || '공유된 사진'}</h1>
        {message && <p className="text-sm text-muted-foreground mt-1">{message}</p>}
        <p className="text-xs text-muted-foreground mt-1">{photos.length}장</p>
      </div>

      <div className="p-4">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <ImageIcon className="w-10 h-10" /><p className="text-sm">공유된 사진이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setViewerIndex(i)}
                className="aspect-square rounded-lg overflow-hidden bg-muted border border-border relative group">
                {p.status === 'ready' ? (
                  <img src={`/api/share/photos/${token}/media/${p.id}/thumb_medium`} alt={p.originalFileName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="w-5 h-5" /></div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewerIndex !== null && photos[viewerIndex] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
            <span className="text-white text-sm truncate">{photos[viewerIndex].title || photos[viewerIndex].originalFileName}</span>
            <div className="flex items-center gap-1">
              {allowOriginalDownload ? (
                <a href={`/api/share/photos/${token}/media/${photos[viewerIndex].id}/original`} download
                  className="p-2 text-white hover:bg-white/10 rounded-md" title="원본 다운로드"><Download className="w-4 h-4" /></a>
              ) : allowDownload ? (
                <a href={`/api/share/photos/${token}/media/${photos[viewerIndex].id}/preview_large`} download
                  className="p-2 text-white hover:bg-white/10 rounded-md" title="다운로드"><Download className="w-4 h-4" /></a>
              ) : null}
              <button onClick={() => setViewerIndex(null)} className="p-2 text-white hover:bg-white/10 rounded-md"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {viewerIndex > 0 && (
              <button onClick={() => setViewerIndex(v => (v ?? 0) - 1)} className="absolute left-2 z-10 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full"><ChevronLeft className="w-8 h-8" /></button>
            )}
            <img src={`/api/share/photos/${token}/media/${photos[viewerIndex].id}/preview_large`} alt={photos[viewerIndex].originalFileName} className="max-w-full max-h-full object-contain" />
            {viewerIndex < photos.length - 1 && (
              <button onClick={() => setViewerIndex(v => (v ?? 0) + 1)} className="absolute right-2 z-10 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full"><ChevronRight className="w-8 h-8" /></button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
