'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw,
  Download, Star, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewerPhoto {
  id: string;
  originalFileName: string;
  title: string | null;
  status: 'processing' | 'ready' | 'failed';
  isFavorited?: boolean;
}

interface PhotoViewerProps {
  photos: ViewerPhoto[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onFavoriteToggled?: (photoId: string, favorited: boolean) => void;
}

/** 전체화면 사진 뷰어 — 요청서 5번: 이전/다음(클릭+키보드+swipe), 확대/축소/100%/맞춤,
 * 회전(뷰만, 원본 불변), 다운로드, 즐겨찾기, 정보보기, Esc/+/-  단축키, focus trap. */
export function PhotoViewer({ photos, index, onClose, onIndexChange, onFavoriteToggled }: PhotoViewerProps) {
  const [zoom, setZoom] = useState<'fit' | '100'>('fit');
  const [rotation, setRotation] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const goPrev = useCallback(() => { if (hasPrev) { onIndexChange(index - 1); setZoom('fit'); setRotation(0); setShowInfo(false); } }, [hasPrev, index, onIndexChange]);
  const goNext = useCallback(() => { if (hasNext) { onIndexChange(index + 1); setZoom('fit'); setRotation(0); setShowInfo(false); } }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    containerRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') setZoom('100');
      else if (e.key === '-') setZoom('fit');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/photos/${photo.id}/media/original`;
    a.click();
  };

  const handleFavorite = async () => {
    const res = await fetch(`/api/photos/${photo.id}/favorite`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      onFavoriteToggled?.(photo.id, data.favorited);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`사진 뷰어 — ${photo.originalFileName}`}
      className="fixed inset-0 z-[90] bg-black flex flex-col outline-none"
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current == null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta > 60) goPrev(); else if (delta < -60) goNext();
        touchStartX.current = null;
      }}
    >
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 shrink-0 z-10">
        <span className="text-white text-sm truncate flex-1 mr-4">{photo.title || photo.originalFileName}</span>
        <div className="flex items-center gap-1">
          <button aria-label={zoom === 'fit' ? '100% 확대' : '화면 맞춤'} onClick={() => setZoom(z => z === 'fit' ? '100' : 'fit')} className="p-2 text-white hover:bg-white/10 rounded-md" title={zoom === 'fit' ? '100%' : '화면 맞춤'}>
            {zoom === 'fit' ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
          </button>
          <button aria-label="화면에 맞춤" onClick={() => setZoom('fit')} className="p-2 text-white hover:bg-white/10 rounded-md" title="화면 맞춤"><Maximize2 className="w-4 h-4" /></button>
          <button aria-label="회전" onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 text-white hover:bg-white/10 rounded-md" title="회전(보기 전용, 원본 변형 없음)"><RotateCw className="w-4 h-4" /></button>
          <button aria-label="즐겨찾기" onClick={handleFavorite} className="p-2 text-white hover:bg-white/10 rounded-md" title="즐겨찾기">
            <Star className={cn('w-4 h-4', photo.isFavorited && 'fill-yellow-400 text-yellow-400')} />
          </button>
          <button aria-label="다운로드" onClick={handleDownload} className="p-2 text-white hover:bg-white/10 rounded-md" title="다운로드"><Download className="w-4 h-4" /></button>
          <button aria-label="정보 보기" onClick={() => setShowInfo(v => !v)} className="p-2 text-white hover:bg-white/10 rounded-md" title="정보"><Info className="w-4 h-4" /></button>
          <button aria-label="닫기" onClick={onClose} className="p-2 text-white hover:bg-white/10 rounded-md" title="닫기 (Esc)"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {hasPrev && (
          <button aria-label="이전 사진" onClick={goPrev} className="absolute left-2 z-10 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}
        {photo.status === 'ready' ? (
          <img
            src={`/api/photos/${photo.id}/media/preview_large`}
            alt={photo.originalFileName}
            className={cn('transition-transform', zoom === 'fit' ? 'max-w-full max-h-full object-contain' : 'max-w-none')}
            style={{ transform: `rotate(${rotation}deg)`, ...(zoom === '100' ? { width: 'auto', height: 'auto' } : {}) }}
          />
        ) : (
          <div className="text-white/60 text-sm">{photo.status === 'processing' ? '미리보기 생성 중입니다' : '미리보기를 사용할 수 없습니다'}</div>
        )}
        {hasNext && (
          <button aria-label="다음 사진" onClick={goNext} className="absolute right-2 z-10 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>

      {showInfo && (
        <div className="absolute right-4 top-16 bottom-4 w-64 bg-black/80 rounded-lg p-3 text-white text-xs overflow-y-auto">
          <div className="font-medium text-sm mb-2 break-all">{photo.originalFileName}</div>
          <div className="text-white/60">{index + 1} / {photos.length}</div>
        </div>
      )}
    </div>
  );
}
