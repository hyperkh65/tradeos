'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Images, Folder, FolderPlus, ChevronRight, ChevronDown, Upload, Loader2,
  Grid3X3, LayoutGrid, List, X, ImageIcon, RefreshCw, Star, Maximize2,
} from 'lucide-react';
import { PhotoViewer } from '@/components/photos/photo-viewer';

// ── 타입 ────────────────────────────────────────────────────────────────────
interface PhotoFolder {
  id: string; name: string; parentFolderId: string | null; isPublic: boolean;
  ownerUserId: string | null; children?: PhotoFolder[];
}
interface Photo {
  id: string; originalFileName: string; width: number | null; height: number | null;
  fileSize: number; status: 'processing' | 'ready' | 'failed'; capturedAt: string | null;
  uploadedAt: string; uploadedBy: string; uploadedByName: string; title: string | null; folderId: string | null;
  isFavorited: boolean;
}
type ViewMode = 'grid-large' | 'grid-medium' | 'grid-small' | 'list';
type UploadItem = { file: File; status: 'pending' | 'uploading' | 'ok' | 'duplicate' | 'error'; error?: string };

const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : b >= 1024 ? `${Math.round(b / 1024)}KB` : `${b}B`;
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

function buildTree(folders: PhotoFolder[]): PhotoFolder[] {
  const map = new Map<string, PhotoFolder>();
  folders.forEach(f => map.set(f.id, { ...f, children: [] }));
  const roots: PhotoFolder[] = [];
  folders.forEach(f => {
    const node = map.get(f.id)!;
    if (f.parentFolderId && map.has(f.parentFolderId)) map.get(f.parentFolderId)!.children!.push(node);
    else roots.push(node);
  });
  return roots;
}

const GRID_SIZE_CLASS: Record<ViewMode, string> = {
  'grid-large': 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]',
  'grid-medium': 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
  'grid-small': 'grid-cols-[repeat(auto-fill,minmax(100px,1fr))]',
  list: '',
};

export default function PhotosPage() {
  const [folders, setFolders] = useState<PhotoFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid-medium');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState<string | null | 'root'>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사용자별 마지막 보기방식 저장(요청서 4번) — 별도 설정 테이블 없이 localStorage로 충분.
  useEffect(() => {
    const saved = localStorage.getItem('photos_view_mode') as ViewMode | null;
    if (saved) setViewMode(saved);
  }, []);
  useEffect(() => { localStorage.setItem('photos_view_mode', viewMode); }, [viewMode]);

  const loadFolders = useCallback(async () => {
    const res = await fetch('/api/photos/folders');
    const data = await res.json();
    if (data.folders) setFolders(data.folders);
  }, []);

  const loadPhotos = useCallback(async (folderId: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?folderId=${folderId ?? 'null'}`);
      const data = await res.json();
      setPhotos(data.photos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadPhotos(selectedFolderId); setSelectedPhoto(null); }, [selectedFolderId, loadPhotos]);

  const tree = useMemo(() => buildTree(folders), [folders]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createFolder = async (parentFolderId: string | null) => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/photos/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName, parentFolderId }),
    });
    if (res.ok) {
      setNewFolderName('');
      setShowNewFolder(null);
      await loadFolders();
      if (parentFolderId) setExpanded(prev => new Set(prev).add(parentFolderId));
    }
  };

  // ── 업로드(drag&drop + 파일선택, 여러 장, 한 파일 실패해도 나머지 계속) ──────────
  const doUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const items: UploadItem[] = files.map(file => ({ file, status: 'pending' }));
    setUploads(prev => [...items, ...prev]);

    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    if (selectedFolderId) fd.append('folderId', selectedFolderId);

    setUploads(prev => prev.map(u => items.includes(u) ? { ...u, status: 'uploading' } : u));
    try {
      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      const data = await res.json();
      const results: { fileName: string; status: string; error?: string }[] = data.results || [];
      setUploads(prev => prev.map(u => {
        if (!items.includes(u)) return u;
        const r = results.find(x => x.fileName === u.file.name);
        if (!r) return { ...u, status: 'error', error: '알 수 없는 오류' };
        return { ...u, status: r.status as UploadItem['status'], error: r.error };
      }));
      await loadPhotos(selectedFolderId);
    } catch {
      setUploads(prev => prev.map(u => items.includes(u) ? { ...u, status: 'error', error: '네트워크 오류' } : u));
    }
  };

  const retryUpload = (item: UploadItem) => {
    setUploads(prev => prev.filter(u => u !== item));
    doUpload([item.file]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    doUpload(files);
  };

  const currentFolder = folders.find(f => f.id === selectedFolderId) || null;

  function FolderNode({ node, depth }: { node: PhotoFolder; depth: number }) {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div>
        <div
          className={cn('flex items-center gap-1 px-1.5 py-1 rounded-md text-sm cursor-pointer hover:bg-muted',
            selectedFolderId === node.id && 'bg-primary/10 text-primary font-medium')}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setSelectedFolderId(node.id)}
        >
          <button type="button" onClick={e => { e.stopPropagation(); toggleExpand(node.id); }}
            className={cn('shrink-0', !hasChildren && 'invisible')}>
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span className="truncate flex-1">{node.name}</span>
          {!node.isPublic && <span className="text-[9px] text-muted-foreground shrink-0">개인</span>}
        </div>
        {isExpanded && hasChildren && node.children!.map(c => <FolderNode key={c.id} node={c} depth={depth + 1} />)}
        {showNewFolder === node.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
            <Input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createFolder(node.id); } if (e.key === 'Escape') setShowNewFolder(null); }}
              placeholder="폴더 이름" className="h-6 text-xs" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      <AppHeader title="사진첩" actions={
        <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
          <Upload className="w-3.5 h-3.5" />사진 올리기
        </Button>
      } />
      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
        onChange={e => { doUpload(Array.from(e.target.files || [])); e.target.value = ''; }} />

      <div className="flex-1 flex min-h-0">
        {/* ── 왼쪽: 폴더 트리 ── */}
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto p-2">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-xs font-semibold text-muted-foreground">폴더</span>
            <button type="button" onClick={() => setShowNewFolder('root')} className="text-muted-foreground hover:text-foreground" title="새 폴더">
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className={cn('flex items-center gap-1.5 px-1.5 py-1 rounded-md text-sm cursor-pointer hover:bg-muted mb-0.5',
            selectedFolderId === null && 'bg-primary/10 text-primary font-medium')}
            onClick={() => setSelectedFolderId(null)}>
            <Images className="w-3.5 h-3.5 text-primary" /> 전체 사진
          </div>
          {showNewFolder === 'root' && (
            <div className="flex items-center gap-1 py-1 pl-1.5">
              <Input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createFolder(null); } if (e.key === 'Escape') setShowNewFolder(null); }}
                placeholder="폴더 이름" className="h-6 text-xs" />
            </div>
          )}
          {tree.map(f => <FolderNode key={f.id} node={f} depth={0} />)}
        </div>

        {/* ── 가운데: 그리드 ── */}
        <div
          className={cn('flex-1 flex flex-col min-w-0 relative', dragOver && 'ring-2 ring-primary ring-inset')}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <div className="text-sm text-muted-foreground truncate">
              사진첩 {currentFolder ? `> ${currentFolder.name}` : '> 전체 사진'} · {photos.length}장
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon-xs" variant={viewMode === 'grid-large' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid-large')} title="큰 썸네일"><LayoutGrid className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={viewMode === 'grid-medium' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid-medium')} title="중간 썸네일"><Grid3X3 className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={viewMode === 'list' ? 'secondary' : 'ghost'} onClick={() => setViewMode('list')} title="목록"><List className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant="ghost" onClick={() => loadPhotos(selectedFolderId)} title="새로고침"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {uploads.length > 0 && (
            <div className="border-b border-border p-2 max-h-32 overflow-y-auto space-y-1 shrink-0 bg-muted/30">
              {uploads.map((u, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {u.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                  <span className="truncate flex-1">{u.file.name}</span>
                  {u.status === 'ok' && <span className="text-green-600 shrink-0">완료</span>}
                  {u.status === 'duplicate' && <span className="text-amber-600 shrink-0">이미 있는 사진</span>}
                  {u.status === 'error' && (
                    <>
                      <span className="text-red-600 shrink-0 truncate max-w-[160px]">{u.error}</span>
                      <button onClick={() => retryUpload(u)} className="text-primary shrink-0 hover:underline">재시도</button>
                    </>
                  )}
                  <button onClick={() => setUploads(prev => prev.filter(x => x !== u))} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
                <Images className="w-10 h-10" />
                <p className="text-sm">사진이 없습니다</p>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5"><Upload className="w-3.5 h-3.5" />사진 올리기</Button>
                <p className="text-xs">이 폴더로 파일을 끌어다 놓아도 업로드됩니다</p>
              </div>
            ) : viewMode === 'list' ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr><th className="py-1.5 font-medium">파일명</th><th className="font-medium">업로더</th><th className="font-medium">업로드일</th><th className="font-medium text-right">크기</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {photos.map(p => (
                    <tr key={p.id} className={cn('cursor-pointer hover:bg-muted/50', selectedPhoto?.id === p.id && 'bg-primary/5')} onClick={() => setSelectedPhoto(p)}>
                      <td className="py-1.5 flex items-center gap-2 truncate max-w-xs">
                        <img src={`/api/photos/${p.id}/media/thumb_small`} alt="" className="w-8 h-8 object-cover rounded shrink-0 bg-muted" onError={e => (e.currentTarget.style.visibility = 'hidden')} />
                        <span className="truncate">{p.title || p.originalFileName}</span>
                      </td>
                      <td className="text-muted-foreground">{p.uploadedByName}</td>
                      <td className="text-muted-foreground">{fmtDate(p.uploadedAt)}</td>
                      <td className="text-right text-muted-foreground">{fmtSize(p.fileSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={cn('grid gap-2', GRID_SIZE_CLASS[viewMode])}>
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setSelectedPhoto(p)} onDoubleClick={() => setViewerIndex(i)}
                    className={cn('aspect-square rounded-lg overflow-hidden border-2 border-transparent bg-muted relative group',
                      selectedPhoto?.id === p.id && 'border-primary')}>
                    {p.isFavorited && <Star className="absolute top-1 right-1 w-3.5 h-3.5 fill-yellow-400 text-yellow-400 z-10 drop-shadow" />}
                    {p.status === 'ready' ? (
                      <img src={`/api/photos/${p.id}/media/thumb_medium`} alt={p.originalFileName} className="w-full h-full object-cover" loading="lazy" />
                    ) : p.status === 'processing' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" /><span className="text-[10px]">처리 중</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-red-400">
                        <ImageIcon className="w-5 h-5" /><span className="text-[10px]">미리보기 실패</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.title || p.originalFileName}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {dragOver && (
            <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
              <div className="bg-background rounded-lg px-4 py-3 shadow-lg text-sm font-medium">여기에 놓아서 업로드</div>
            </div>
          )}
        </div>

        {/* ── 오른쪽: 정보 패널 ── */}
        {selectedPhoto && (
          <div className="w-72 shrink-0 border-l border-border overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">사진 정보</span>
              <button onClick={() => setSelectedPhoto(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
            </div>
            <button
              type="button"
              onClick={() => {
                const idx = photos.findIndex(p => p.id === selectedPhoto.id);
                if (idx >= 0) setViewerIndex(idx);
              }}
              className="block w-full aspect-video rounded-lg overflow-hidden bg-muted mb-3 relative group"
              title="크게 보기"
            >
              {selectedPhoto.status === 'ready' && (
                <img src={`/api/photos/${selectedPhoto.id}/media/preview_large`} alt="" className="w-full h-full object-contain" />
              )}
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <Maximize2 className="w-5 h-5 text-white" />
              </span>
            </button>
            <div className="space-y-1.5 text-xs">
              <div className="font-medium text-sm break-all">{selectedPhoto.title || selectedPhoto.originalFileName}</div>
              <InfoRow label="파일명" value={selectedPhoto.originalFileName} />
              <InfoRow label="크기" value={fmtSize(selectedPhoto.fileSize)} />
              <InfoRow label="해상도" value={selectedPhoto.width && selectedPhoto.height ? `${selectedPhoto.width}×${selectedPhoto.height}` : '-'} />
              <InfoRow label="업로더" value={selectedPhoto.uploadedByName} />
              <InfoRow label="업로드일" value={fmtDate(selectedPhoto.uploadedAt)} />
              <InfoRow label="촬영일" value={fmtDate(selectedPhoto.capturedAt)} />
            </div>
          </div>
        )}
      </div>

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          onFavoriteToggled={(photoId, favorited) => {
            setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, isFavorited: favorited } : p));
            setSelectedPhoto(prev => prev && prev.id === photoId ? { ...prev, isFavorited: favorited } : prev);
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
