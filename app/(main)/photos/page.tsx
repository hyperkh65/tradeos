'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Images, Folder, FolderPlus, ChevronRight, ChevronDown, Upload, Loader2,
  Grid3X3, LayoutGrid, List, X, ImageIcon, RefreshCw, Star, Maximize2,
  Search, SlidersHorizontal, Calendar as CalendarIcon, ArrowUpDown, Trash2,
  Share2, CheckSquare, Square, Tag as TagIcon, FolderInput,
} from 'lucide-react';
import { PhotoViewer } from '@/components/photos/photo-viewer';
import { PhotoDetailPanel } from '@/components/photos/photo-detail-panel';
import { TrashView } from '@/components/photos/trash-view';
import { FolderShareModal } from '@/components/photos/folder-share-modal';
import { ExternalShareModal } from '@/components/photos/external-share-modal';

// ── 타입 ────────────────────────────────────────────────────────────────────
interface PhotoFolder {
  id: string; name: string; parentFolderId: string | null; isPublic: boolean;
  ownerUserId: string | null; children?: PhotoFolder[];
}
interface Photo {
  id: string; originalFileName: string; width: number | null; height: number | null;
  fileSize: number; status: 'processing' | 'ready' | 'failed'; capturedAt: string | null;
  uploadedAt: string; uploadedBy: string; uploadedByName: string; title: string | null; description: string | null; folderId: string | null;
  isFavorited: boolean;
}
type ViewMode = 'grid-large' | 'grid-medium' | 'grid-small' | 'list' | 'timeline';
type UploadItem = { file: File; status: 'pending' | 'uploading' | 'ok' | 'duplicate' | 'error'; error?: string };
type SortKey = 'uploaded_desc' | 'uploaded_asc' | 'captured_desc' | 'captured_asc' | 'name_asc' | 'size_desc';

interface PhotoFilters {
  q: string; uploader: string; extension: string;
  dateFrom: string; dateTo: string; capturedFrom: string; capturedTo: string;
}
const EMPTY_FILTERS: PhotoFilters = { q: '', uploader: '', extension: '', dateFrom: '', dateTo: '', capturedFrom: '', capturedTo: '' };
const SORT_LABELS: Record<SortKey, string> = {
  uploaded_desc: '업로드 최신순', uploaded_asc: '업로드 오래된순',
  captured_desc: '촬영 최신순', captured_asc: '촬영 오래된순',
  name_asc: '파일명순', size_desc: '용량 큰순',
};

const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : b >= 1024 ? `${Math.round(b / 1024)}KB` : `${b}B`;
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
const monthLabel = (s: string) => { const d = new Date(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월`; };

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
  timeline: 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
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
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [shareModalFolder, setShareModalFolder] = useState<PhotoFolder | null>(null);

  // ── 그리드 다중선택 + 일괄 처리(요청서 39번) ────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showExternalShareModal, setShowExternalShareModal] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkFavorite = async () => {
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => fetch(`/api/photos/${id}/favorite`, { method: 'POST' })));
      await loadPhotos(selectedFolderId);
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkAddTag = async () => {
    const name = bulkTagInput.trim();
    if (!name) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => fetch(`/api/photos/${id}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })));
      setBulkTagInput('');
      setShowBulkTagInput(false);
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`선택한 ${selectedIds.size}장을 휴지통으로 이동할까요?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' })));
      setPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDownload = () => {
    for (const id of selectedIds) {
      const a = document.createElement('a');
      a.href = `/api/photos/${id}/media/original`;
      a.click();
    }
  };

  // ── 검색/필터/정렬/무한스크롤(요청서 21~26번) ──────────────────────────────
  const [filters, setFilters] = useState<PhotoFilters>(EMPTY_FILTERS);
  const [filterDraft, setFilterDraft] = useState<PhotoFilters>(EMPTY_FILTERS);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sort, setSort] = useState<SortKey>('uploaded_desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isSearchActive = Object.values(filters).some(v => v);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => {
      if (j?.user?.id) setCurrentUser({ id: j.user.id, role: j.user.role });
    }).catch(() => {});
  }, []);

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

  const buildQuery = useCallback((folderId: string | null, cursor?: string | null) => {
    const sp = new URLSearchParams();
    sp.set('folderId', folderId ?? 'null');
    sp.set('sort', sort);
    if (filters.q) sp.set('q', filters.q);
    if (filters.uploader) sp.set('uploader', filters.uploader);
    if (filters.extension) sp.set('extension', filters.extension);
    if (filters.dateFrom) sp.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) sp.set('dateTo', filters.dateTo + 'T23:59:59.999Z');
    if (filters.capturedFrom) sp.set('capturedFrom', filters.capturedFrom);
    if (filters.capturedTo) sp.set('capturedTo', filters.capturedTo + 'T23:59:59.999Z');
    if (cursor) sp.set('cursor', cursor);
    return sp.toString();
  }, [sort, filters]);

  const loadPhotos = useCallback(async (folderId: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?${buildQuery(folderId)}`);
      const data = await res.json();
      setPhotos(data.photos || []);
      setNextCursor(data.nextCursor || null);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMorePhotos = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/photos?${buildQuery(selectedFolderId, nextCursor)}`);
      const data = await res.json();
      setPhotos(prev => [...prev, ...(data.photos || [])]);
      setNextCursor(data.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildQuery, selectedFolderId]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadPhotos(selectedFolderId); setSelectedPhoto(null); }, [selectedFolderId, loadPhotos]);

  // 무한 스크롤 — 그리드 하단 sentinel이 보이면 다음 커서 페이지를 이어붙인다(요청서 26번).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMorePhotos();
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadMorePhotos, photos.length]);

  const applyQuickFilter = (days: number | null) => {
    if (days === null) { setFilters(EMPTY_FILTERS); setFilterDraft(EMPTY_FILTERS); return; }
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const next = { ...EMPTY_FILTERS, dateFrom: from.slice(0, 10) };
    setFilters(next);
    setFilterDraft(next);
  };

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
          {!!currentUser && (currentUser.id === node.ownerUserId || currentUser.role === 'admin') && (
            <button type="button" onClick={e => { e.stopPropagation(); setShareModalFolder(node); }}
              className="shrink-0 text-muted-foreground hover:text-primary" title="폴더 공유">
              <Share2 className="w-3 h-3" />
            </button>
          )}
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
            !showTrash && selectedFolderId === null && 'bg-primary/10 text-primary font-medium')}
            onClick={() => { setShowTrash(false); setSelectedFolderId(null); }}>
            <Images className="w-3.5 h-3.5 text-primary" /> 전체 사진
          </div>
          <div className={cn('flex items-center gap-1.5 px-1.5 py-1 rounded-md text-sm cursor-pointer hover:bg-muted mb-1',
            showTrash && 'bg-primary/10 text-primary font-medium')}
            onClick={() => { setShowTrash(true); setSelectedPhoto(null); }}>
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" /> 휴지통
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

        {showTrash ? (
          <TrashView isAdmin={currentUser?.role === 'admin'} />
        ) : (
        <>
        {/* ── 가운데: 그리드 ── */}
        <div
          className={cn('flex-1 flex flex-col min-w-0 relative', dragOver && 'ring-2 ring-primary ring-inset')}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 gap-2">
            <div className="text-xs text-muted-foreground truncate shrink-0">
              사진첩 {isSearchActive ? '> 검색 결과' : currentFolder ? `> ${currentFolder.name}` : '> 전체 사진'} · {photos.length}장{nextCursor ? '+' : ''}
            </div>
            <div className="flex-1 flex items-center gap-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={filterDraft.q}
                  onChange={e => setFilterDraft(prev => ({ ...prev, q: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') setFilters(filterDraft); }}
                  onBlur={() => setFilters(filterDraft)}
                  placeholder="파일명·제목·설명 검색"
                  className="w-full h-7 text-xs pl-7 pr-2 border border-border rounded-md bg-background"
                />
              </div>
              <Button size="icon-xs" variant={showFilterPanel || isSearchActive ? 'secondary' : 'ghost'} onClick={() => setShowFilterPanel(v => !v)} title="필터"><SlidersHorizontal className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative">
                <Button size="icon-xs" variant={showSortMenu ? 'secondary' : 'ghost'} onClick={() => setShowSortMenu(v => !v)} title="정렬"><ArrowUpDown className="w-3.5 h-3.5" /></Button>
                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-md shadow-md py-1 w-36">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                      <button key={k} onClick={() => { setSort(k); setShowSortMenu(false); }}
                        className={cn('block w-full text-left text-xs px-2.5 py-1.5 hover:bg-muted', sort === k && 'text-primary font-medium')}>
                        {SORT_LABELS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button size="icon-xs" variant={viewMode === 'grid-large' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid-large')} title="큰 썸네일"><LayoutGrid className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={viewMode === 'grid-medium' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid-medium')} title="중간 썸네일"><Grid3X3 className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={viewMode === 'list' ? 'secondary' : 'ghost'} onClick={() => setViewMode('list')} title="목록"><List className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={viewMode === 'timeline' ? 'secondary' : 'ghost'} onClick={() => setViewMode('timeline')} title="타임라인"><CalendarIcon className="w-3.5 h-3.5" /></Button>
              <Button size="icon-xs" variant={selectMode ? 'secondary' : 'ghost'}
                onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }} title="여러 장 선택">
                {selectMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </Button>
              <Button size="icon-xs" variant="ghost" onClick={() => loadPhotos(selectedFolderId)} title="새로고침"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {showFilterPanel && (
            <div className="border-b border-border p-3 shrink-0 bg-muted/20 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1">빠른 필터</span>
                <button onClick={() => applyQuickFilter(0)} className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted">오늘</button>
                <button onClick={() => applyQuickFilter(7)} className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted">최근 7일</button>
                <button onClick={() => applyQuickFilter(30)} className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted">최근 30일</button>
                {isSearchActive && <button onClick={() => applyQuickFilter(null)} className="text-[11px] px-2 py-0.5 rounded-full border border-primary text-primary hover:bg-primary/10 ml-auto">필터 초기화</button>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">업로더</span>
                  <input value={filterDraft.uploader} onChange={e => setFilterDraft(prev => ({ ...prev, uploader: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') setFilters(filterDraft); }} onBlur={() => setFilters(filterDraft)}
                    className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">확장자</span>
                  <input value={filterDraft.extension} onChange={e => setFilterDraft(prev => ({ ...prev, extension: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') setFilters(filterDraft); }} onBlur={() => setFilters(filterDraft)}
                    placeholder="jpg, png…" className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">업로드일 시작</span>
                  <input type="date" value={filterDraft.dateFrom} onChange={e => { const next = { ...filterDraft, dateFrom: e.target.value }; setFilterDraft(next); setFilters(next); }}
                    className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">업로드일 끝</span>
                  <input type="date" value={filterDraft.dateTo} onChange={e => { const next = { ...filterDraft, dateTo: e.target.value }; setFilterDraft(next); setFilters(next); }}
                    className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">촬영일 시작</span>
                  <input type="date" value={filterDraft.capturedFrom} onChange={e => { const next = { ...filterDraft, capturedFrom: e.target.value }; setFilterDraft(next); setFilters(next); }}
                    className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-muted-foreground">촬영일 끝</span>
                  <input type="date" value={filterDraft.capturedTo} onChange={e => { const next = { ...filterDraft, capturedTo: e.target.value }; setFilterDraft(next); setFilters(next); }}
                    className="w-full h-7 px-1.5 border border-border rounded bg-background" />
                </label>
              </div>
            </div>
          )}

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

          {selectMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-primary/5">
              <span className="text-xs font-medium">{selectedIds.size}장 선택됨</span>
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={bulkFavorite} disabled={bulkBusy} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                  <Star className="w-3 h-3" />즐겨찾기
                </button>
                <div className="relative">
                  <button onClick={() => setShowBulkTagInput(v => !v)} disabled={bulkBusy} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                    <TagIcon className="w-3 h-3" />태그
                  </button>
                  {showBulkTagInput && (
                    <div className="absolute top-full mt-1 left-0 z-20 bg-popover border border-border rounded-md shadow-md p-1.5 flex items-center gap-1">
                      <input autoFocus value={bulkTagInput} onChange={e => setBulkTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') bulkAddTag(); if (e.key === 'Escape') setShowBulkTagInput(false); }}
                        placeholder="태그 이름" className="h-6 text-xs px-1.5 border border-border rounded w-24" />
                      <button onClick={bulkAddTag} className="text-[11px] text-primary shrink-0">추가</button>
                    </div>
                  )}
                </div>
                <button onClick={bulkDownload} disabled={bulkBusy} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                  <Upload className="w-3 h-3 rotate-180" />다운로드
                </button>
                <button onClick={() => setShowExternalShareModal(true)} disabled={bulkBusy} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                  <Share2 className="w-3 h-3" />외부 공유
                </button>
                <button onClick={bulkDelete} disabled={bulkBusy} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="w-3 h-3" />삭제
                </button>
              </div>
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
            ) : viewMode === 'timeline' ? (
              <div className="space-y-5">
                {groupPhotosByMonth(photos).map(group => (
                  <div key={group.key}>
                    <div className="text-xs font-semibold text-muted-foreground mb-1.5 sticky top-0 bg-background/95 py-1">{group.label} · {group.items.length}장</div>
                    <div className={cn('grid gap-2', GRID_SIZE_CLASS['grid-medium'])}>
                      {group.items.map(p => (
                        <PhotoThumb key={p.id} p={p} photos={photos} selectedPhoto={selectedPhoto} setSelectedPhoto={setSelectedPhoto} setViewerIndex={setViewerIndex}
                          selectMode={selectMode} selected={selectedIds.has(p.id)} onToggleSelect={toggleSelect} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={cn('grid gap-2', GRID_SIZE_CLASS[viewMode])}>
                {photos.map(p => (
                  <PhotoThumb key={p.id} p={p} photos={photos} selectedPhoto={selectedPhoto} setSelectedPhoto={setSelectedPhoto} setViewerIndex={setViewerIndex}
                    selectMode={selectMode} selected={selectedIds.has(p.id)} onToggleSelect={toggleSelect} />
                ))}
              </div>
            )}
            {nextCursor && (
              <div ref={sentinelRef} className="flex items-center justify-center py-4 text-muted-foreground">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
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
              <div className="flex items-center gap-2">
                {!!currentUser && (currentUser.id === selectedPhoto.uploadedBy || currentUser.role === 'admin') && (
                  <button
                    title="휴지통으로 이동"
                    onClick={async () => {
                      if (!confirm(`"${selectedPhoto.originalFileName}"을(를) 휴지통으로 이동할까요?`)) return;
                      const res = await fetch(`/api/photos/${selectedPhoto.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        setPhotos(prev => prev.filter(p => p.id !== selectedPhoto.id));
                        setSelectedPhoto(null);
                      }
                    }}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setSelectedPhoto(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
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
            <PhotoDetailPanel
              photoId={selectedPhoto.id}
              title={selectedPhoto.title}
              description={selectedPhoto.description}
              currentUserId={currentUser?.id ?? null}
              canEdit={!!currentUser && (currentUser.id === selectedPhoto.uploadedBy || currentUser.role === 'admin')}
              onDescriptionSaved={(nextTitle, nextDescription) => {
                setPhotos(prev => prev.map(p => p.id === selectedPhoto.id ? { ...p, title: nextTitle, description: nextDescription } : p));
                setSelectedPhoto(prev => prev ? { ...prev, title: nextTitle, description: nextDescription } : prev);
              }}
            />
          </div>
        )}
        </>
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

      {shareModalFolder && (
        <FolderShareModal folderId={shareModalFolder.id} folderName={shareModalFolder.name} onClose={() => setShareModalFolder(null)} />
      )}

      {showExternalShareModal && (
        <ExternalShareModal photoIds={[...selectedIds]} onClose={() => { setShowExternalShareModal(false); setSelectedIds(new Set()); setSelectMode(false); }} />
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

/** Timeline View(요청서 27번) — 촬영월 기준, 촬영일 없으면 업로드월로 대체. */
function groupPhotosByMonth(photos: Photo[]): { key: string; label: string; items: Photo[] }[] {
  const groups = new Map<string, Photo[]>();
  for (const p of photos) {
    const basis = p.capturedAt || p.uploadedAt;
    const key = basis.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, label: monthLabel(items[0].capturedAt || items[0].uploadedAt), items }));
}

function PhotoThumb({ p, photos, selectedPhoto, setSelectedPhoto, setViewerIndex, selectMode, selected, onToggleSelect }: {
  p: Photo; photos: Photo[]; selectedPhoto: Photo | null;
  setSelectedPhoto: (p: Photo) => void; setViewerIndex: (i: number) => void;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void;
}) {
  return (
    <button type="button" onClick={() => selectMode ? onToggleSelect?.(p.id) : setSelectedPhoto(p)}
      onDoubleClick={() => { if (selectMode) return; const idx = photos.findIndex(x => x.id === p.id); if (idx >= 0) setViewerIndex(idx); }}
      className={cn('aspect-square rounded-lg overflow-hidden border-2 border-transparent bg-muted relative group',
        selected ? 'border-primary ring-2 ring-primary/40' : selectedPhoto?.id === p.id && 'border-primary')}>
      {selectMode && (
        <div className={cn('absolute top-1 left-1 z-10 w-4 h-4 rounded flex items-center justify-center border',
          selected ? 'bg-primary border-primary text-primary-foreground' : 'bg-black/40 border-white/70')}>
          {selected && <CheckSquare className="w-3 h-3" />}
        </div>
      )}
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
  );
}
