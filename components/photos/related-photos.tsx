'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Images, Plus, X, Loader2, Star, Upload, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoViewer } from '@/components/photos/photo-viewer';

type PhotoStatus = 'processing' | 'ready' | 'failed';
interface LinkedPhoto {
  id: string; linkId: string; originalFileName: string; status: PhotoStatus; title: string | null;
}
interface PickerPhoto { id: string; originalFileName: string; title: string | null; status: PhotoStatus }

interface RelatedPhotosProps {
  entityType: string;
  entityId: string;
  /** 제품 화면에서만 true — 대표 이미지 지정 버튼을 보여준다(요청서 32번). */
  canSetRepresentative?: boolean;
  onRepresentativeSet?: (photoId: string, imageUrl: string) => void;
}

/** 업무 화면(제품/검품/클레임/PO/선적/수입/거래처/견적/커미션 등)에 붙이는 공용
 * "관련 사진" 섹션 — 요청서 28~32번. 각 화면은 entityType/entityId만 넘기면 된다. */
export function RelatedPhotos({ entityType, entityId, canSetRepresentative, onRepresentativeSet }: RelatedPhotosProps) {
  const [photos, setPhotos] = useState<LinkedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/entity-photos?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
      const data = await res.json();
      setPhotos(data.photos || []);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const unlink = async (p: LinkedPhoto) => {
    setPhotos(prev => prev.filter(x => x.id !== p.id));
    await fetch(`/api/photos/${p.id}/entities/${p.linkId}`, { method: 'DELETE' });
  };

  const setRepresentative = async (photoId: string) => {
    const res = await fetch(`/api/products/${entityId}/set-representative-photo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId }),
    });
    if (res.ok) {
      const data = await res.json();
      onRepresentativeSet?.(photoId, data.imageUrl);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Images className="w-3.5 h-3.5" />관련 사진{photos.length > 0 && ` (${photos.length})`}</span>
        <button type="button" onClick={() => setShowPicker(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
          <Plus className="w-3 h-3" />사진 연결
        </button>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />불러오는 중…</div>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">연결된 사진이 없습니다</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative group w-20 h-20 rounded-md overflow-hidden bg-muted border border-border">
              <button type="button" onClick={() => setViewerIndex(i)} className="block w-full h-full">
                {p.status === 'ready' ? (
                  <img src={`/api/photos/${p.id}/media/thumb_small`} alt={p.originalFileName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-4 h-4" /></div>
                )}
              </button>
              <button type="button" onClick={() => unlink(p)} title="연결 해제"
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-2.5 h-2.5" />
              </button>
              {canSetRepresentative && (
                <button type="button" onClick={() => setRepresentative(p.id)} title="대표 이미지로 지정"
                  className="absolute bottom-0.5 left-0.5 bg-black/60 text-yellow-400 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Star className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}

      {showPicker && (
        <PhotoPickerModal
          entityType={entityType}
          entityId={entityId}
          onClose={() => setShowPicker(false)}
          onLinked={() => { setShowPicker(false); load(); }}
        />
      )}
    </div>
  );
}

function PhotoPickerModal({ entityType, entityId, onClose, onLinked }: { entityType: string; entityId: string; onClose: () => void; onLinked: () => void }) {
  const [tab, setTab] = useState<'browse' | 'upload'>('browse');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerPhoto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/photos?all=1${q ? `&q=${encodeURIComponent(q)}` : ''}&limit=60`);
      const data = await res.json();
      setResults(data.photos || []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { search(''); }, [search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const linkSelected = async () => {
    if (selected.size === 0) return;
    setLinking(true);
    try {
      await Promise.all([...selected].map(photoId =>
        fetch(`/api/photos/${photoId}/entities`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, entityId }),
        })
      ));
      onLinked();
    } finally {
      setLinking(false);
    }
  };

  const uploadAndLink = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      const data = await res.json();
      const photoIds: string[] = (data.results || []).filter((r: { status: string }) => r.status === 'ok').map((r: { photoId: string }) => r.photoId);
      await Promise.all(photoIds.map(photoId =>
        fetch(`/api/photos/${photoId}/entities`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, entityId }),
        })
      ));
      onLinked();
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => setTab('browse')} className={cn('text-sm px-3 py-1 rounded-md', tab === 'browse' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground')}>기존 사진에서 선택</button>
            <button onClick={() => setTab('upload')} className={cn('text-sm px-3 py-1 rounded-md', tab === 'upload' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground')}>새로 업로드</button>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {tab === 'browse' ? (
          <>
            <div className="p-3 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') search(query); }}
                  placeholder="사진 검색…" className="w-full h-8 text-sm pl-7 pr-2 border border-border rounded-md bg-background" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {searching ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">사진이 없습니다</p>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {results.map(p => (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                      className={cn('aspect-square rounded-md overflow-hidden bg-muted border-2 relative', selected.has(p.id) ? 'border-primary' : 'border-transparent')}>
                      {p.status === 'ready' && <img src={`/api/photos/${p.id}/media/thumb_small`} alt={p.originalFileName} className="w-full h-full object-cover" />}
                      {selected.has(p.id) && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><div className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">✓</div></div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
              <span className="text-xs text-muted-foreground">{selected.size}장 선택됨</span>
              <button onClick={linkSelected} disabled={selected.size === 0 || linking}
                className="text-sm bg-primary text-primary-foreground rounded-md px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5">
                {linking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}연결
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => uploadAndLink(Array.from(e.target.files || []))} />
            <Upload className="w-8 h-8 text-muted-foreground" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}
              className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 flex items-center gap-1.5 disabled:opacity-50">
              {uploadBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}파일 선택 후 업로드
            </button>
            <p className="text-xs text-muted-foreground">업로드한 사진은 이 항목에 자동으로 연결됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
