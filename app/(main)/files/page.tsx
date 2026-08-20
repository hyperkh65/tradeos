'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Upload, FolderPlus, Grid3X3, List, Download, Link2, Copy,
  Trash2, Folder, FolderOpen, FileText, FileSpreadsheet, File, X,
  Edit2, Check, Loader2, Sparkles, ExternalLink, Table2,
  ChevronRight, ChevronDown, MoveRight, FolderInput, MoreHorizontal,
} from 'lucide-react';

// ── 타입 ────────────────────────────────────────────────────────────────────
interface FileFolder {
  id: string; name: string; parent_id: string | null; is_system: number;
  description: string | null; created_by: string; created_at: string;
  children?: FileFolder[];
}
interface FileItem {
  id: string; business_id: string; folder_id: string | null;
  file_name: string; file_path: string; file_size: number; file_type: string;
  category: string; share_token: string | null;
  uploaded_by: string; uploaded_by_id: string; created_at: string;
}
interface QuoteExtraction {
  id: string; file_id: string; file_name: string; file_item_id: string;
  supplier_name: string | null; quote_date: string | null;
  items_json: string; status: string; created_at: string;
}
type CtxTarget = { kind: 'file'; item: FileItem } | { kind: 'folder'; folder: FileFolder } | { kind: 'space' };

// ── 유틸 ────────────────────────────────────────────────────────────────────
const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : b >= 1024 ? `${Math.round(b / 1024)}KB` : `${b}B`;
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '';

function buildTree(folders: FileFolder[]): FileFolder[] {
  const map = new Map<string, FileFolder>();
  folders.forEach(f => map.set(f.id, { ...f, children: [] }));
  const roots: FileFolder[] = [];
  map.forEach(f => {
    if (f.parent_id && map.has(f.parent_id)) map.get(f.parent_id)!.children!.push(f);
    else roots.push(f);
  });
  return roots;
}
function getFolderPath(folders: FileFolder[], targetId: string): FileFolder[] {
  const map = new Map(folders.map(f => [f.id, f]));
  const path: FileFolder[] = [];
  let cur = map.get(targetId);
  while (cur) { path.unshift(cur); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; }
  return path;
}

// ── 파일 아이콘 ──────────────────────────────────────────────────────────────
function FileIcon({ type, name, size = 28 }: { type: string; name: string; size?: number }) {
  const s = size;
  if (type?.includes('pdf') || name?.toLowerCase().endsWith('.pdf'))
    return <div style={{ width: s, height: s }} className="flex items-center justify-center bg-red-50 rounded-lg text-red-500"><FileText className="w-4 h-4" /></div>;
  if (type?.includes('sheet') || name?.match(/\.(xlsx?|csv)$/i))
    return <div style={{ width: s, height: s }} className="flex items-center justify-center bg-green-50 rounded-lg text-green-600"><FileSpreadsheet className="w-4 h-4" /></div>;
  if (type?.includes('word') || name?.match(/\.docx?$/i))
    return <div style={{ width: s, height: s }} className="flex items-center justify-center bg-blue-50 rounded-lg text-blue-600"><FileText className="w-4 h-4" /></div>;
  return <div style={{ width: s, height: s }} className="flex items-center justify-center bg-muted rounded-lg text-muted-foreground"><File className="w-4 h-4" /></div>;
}

// ── 사이드바 트리 노드 ────────────────────────────────────────────────────────
function TreeNode({ folder, depth, selectedId, expandedIds, onSelect, onToggle, onCtx }: {
  folder: FileFolder; depth: number; selectedId: string | null;
  expandedIds: Set<string>; onSelect: (id: string) => void;
  onToggle: (id: string) => void; onCtx: (e: React.MouseEvent, f: FileFolder) => void;
}) {
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedId === folder.id;
  return (
    <div>
      <div
        className={cn('flex items-center gap-1 py-0.5 px-1 rounded-md cursor-pointer group transition-colors select-none',
          isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onSelect(folder.id)}
        onDoubleClick={() => onToggle(folder.id)}
        onContextMenu={e => { e.preventDefault(); onCtx(e, folder); }}>
        <button className="shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={e => { e.stopPropagation(); hasChildren && onToggle(folder.id); }}>
          {hasChildren ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-3" />}
        </button>
        {folder.is_system
          ? <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          : (isExpanded ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400" />)}
        <span className="text-xs truncate flex-1">{folder.name}</span>
      </div>
      {hasChildren && isExpanded && folder.children!.map(child => (
        <TreeNode key={child.id} folder={child} depth={depth + 1}
          selectedId={selectedId} expandedIds={expandedIds}
          onSelect={onSelect} onToggle={onToggle} onCtx={onCtx} />
      ))}
    </div>
  );
}

// ── 컨텍스트 메뉴 ────────────────────────────────────────────────────────────
function CtxMenu({ pos, target, onClose, onAction }: {
  pos: { x: number; y: number }; target: CtxTarget;
  onClose: () => void; onAction: (action: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth; const vh = window.innerHeight;
    if (rect.right > vw) menuRef.current.style.left = `${pos.x - rect.width}px`;
    if (rect.bottom > vh) menuRef.current.style.top = `${pos.y - rect.height}px`;
  }, [pos]);

  const item = (icon: React.ReactNode, label: string, action: string, danger = false, disabled = false) => (
    <button key={action} disabled={disabled}
      className={cn('flex items-center gap-2.5 w-full text-left px-3 py-1.5 text-sm rounded transition-colors',
        disabled ? 'opacity-40 cursor-not-allowed' :
        danger ? 'hover:bg-red-50 text-red-600' : 'hover:bg-accent')}
      onClick={() => { if (!disabled) { onAction(action); onClose(); } }}>
      <span className="w-4 shrink-0 flex justify-center">{icon}</span> {label}
    </button>
  );
  const divider = (k: string) => <div key={k} className="my-1 border-t border-border mx-1" />;

  const menuItems: React.ReactNode[] = [];
  if (target.kind === 'file') {
    menuItems.push(
      item(<Download className="w-3.5 h-3.5" />, '다운로드', 'download'),
      divider('d1'),
      item(<Link2 className="w-3.5 h-3.5" />, '공유 링크 생성', 'share'),
      target.item.share_token ? item(<Link2 className="w-3.5 h-3.5 text-blue-500" />, '링크 복사', 'copyLink') : null,
      divider('d2'),
      item(<Copy className="w-3.5 h-3.5" />, '복사', 'copy'),
      item(<FolderInput className="w-3.5 h-3.5" />, '이동', 'move'),
      item(<Edit2 className="w-3.5 h-3.5" />, '이름 바꾸기', 'rename'),
      target.item.file_name?.match(/\.(xlsx?|csv)$/i) ? divider('d3') : null,
      target.item.file_name?.match(/\.(xlsx?|csv)$/i) ? item(<Table2 className="w-3.5 h-3.5 text-amber-500" />, '열 매핑 추출', 'extract') : null,
      divider('d4'),
      item(<Trash2 className="w-3.5 h-3.5" />, '삭제', 'delete', true),
    );
  } else if (target.kind === 'folder') {
    menuItems.push(
      item(<FolderOpen className="w-3.5 h-3.5" />, '열기', 'openFolder'),
      divider('d1'),
      target.folder.is_system ? null : item(<Edit2 className="w-3.5 h-3.5" />, '이름 바꾸기', 'renameFolder'),
      target.folder.is_system ? null : item(<FolderInput className="w-3.5 h-3.5" />, '이동', 'moveFolder'),
      divider('d2'),
      item(<Trash2 className="w-3.5 h-3.5" />, '삭제', 'deleteFolder', true, !!target.folder.is_system),
    );
  } else {
    menuItems.push(
      item(<FolderPlus className="w-3.5 h-3.5" />, '새 폴더 만들기', 'newFolder'),
      item(<Upload className="w-3.5 h-3.5" />, '파일 업로드', 'uploadFile'),
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="fixed z-50 bg-popover border border-border rounded-xl shadow-2xl py-1.5 w-48 text-sm"
        style={{ left: pos.x, top: pos.y }}>
        {menuItems.filter(Boolean)}
      </div>
    </>
  );
}

// ── 이동 다이얼로그 ───────────────────────────────────────────────────────────
function MoveDialog({ folders, currentFolderId, onMove, onClose }: {
  folders: FileFolder[]; currentFolderId: string | null;
  onMove: (folderId: string | null) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(currentFolderId);
  const tree = buildTree(folders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(folders.map(f => f.id)));

  const renderNode = (folder: FileFolder, depth = 0) => (
    <div key={folder.id}>
      <div
        className={cn('flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-sm transition-colors',
          selected === folder.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => setSelected(folder.id)}>
        {(folder.children?.length ?? 0) > 0
          ? <button onClick={e => { e.stopPropagation(); setExpanded(p => { const n = new Set(p); n.has(folder.id) ? n.delete(folder.id) : n.add(folder.id); return n; }); }}>
              {expanded.has(folder.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          : <span className="w-3.5" />}
        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </div>
      {expanded.has(folder.id) && folder.children?.map(c => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-popover rounded-2xl shadow-2xl w-80 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-base">이동할 폴더 선택</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto max-h-64 p-2">
          <div className={cn('flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-sm', selected === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
            onClick={() => setSelected(null)}>
            <FolderOpen className="w-4 h-4 text-amber-400" /> <span>전체 (최상위)</span>
          </div>
          {tree.map(f => renderNode(f))}
        </div>
        <div className="flex gap-2 justify-end p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={() => onMove(selected)}>이동</Button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function FilesPage() {
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteExtraction[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tab, setTab] = useState<'files' | 'quotes'>('files');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderCreatingRef = useRef(false);

  // 업로드
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // 컨텍스트 메뉴
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; target: CtxTarget } | null>(null);

  // 다이얼로그들
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ kind: 'file'; item: FileItem } | { kind: 'folder'; folder: FileFolder } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ kind: 'file'; item: FileItem } | { kind: 'folder'; folder: FileFolder } | null>(null);
  const [renameName, setRenameName] = useState('');

  // 견적서 열 매핑
  const [mappingFile, setMappingFile] = useState<FileItem | null>(null);
  const [previewData, setPreviewData] = useState<{ colHeaders: string[]; preview: (string | number | null)[][] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [specCol, setSpecCol] = useState<number | null>(null);
  const [priceCol, setPriceCol] = useState<number | null>(null);
  const [startRow, setStartRow] = useState(1);
  const [extracting, setExtracting] = useState<string | null>(null);

  const [toast, setToast] = useState('');
  const showToast = (msg: string, ms = 3000) => { setToast(msg); setTimeout(() => setToast(''), ms); };

  // 데이터 로드
  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user?.role === 'admin') setIsAdmin(true); }).catch(() => {}); }, []);

  const loadFolders = useCallback(async () => {
    const r = await fetch('/api/file-folders');
    const j = await r.json();
    setFolders(j.data || []);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedFolder) params.set('folderId', selectedFolder);
    if (search) params.set('search', search);
    const r = await fetch('/api/file-items?' + params);
    const j = await r.json();
    setFiles(j.data || []);
    setLoading(false);
  }, [selectedFolder, search]);

  const loadQuotes = useCallback(async () => {
    const r = await fetch('/api/quote-extractions');
    const j = await r.json();
    setQuotes(j.data || []);
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { if (tab === 'quotes') loadQuotes(); }, [tab, loadQuotes]);

  const selectFolder = (id: string | null) => {
    setSelectedFolder(id); setTab('files');
    if (id) setExpandedIds(prev => new Set([...prev, id]));
  };
  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // 현재 위치의 서브폴더
  const subFolders = folders.filter(f =>
    selectedFolder === null ? f.parent_id === null : f.parent_id === selectedFolder
  );
  const breadcrumb = selectedFolder ? getFolderPath(folders, selectedFolder) : [];
  const folderTree = buildTree(folders);
  const isQuotesFolder = selectedFolder === 'folder_system_quotes';
  const currentFolderName = selectedFolder ? folders.find(f => f.id === selectedFolder)?.name : null;
  const filteredFiles = files.filter(f => !search || f.file_name.toLowerCase().includes(search.toLowerCase()));

  // ── 업로드 ─────────────────────────────────────────────────────────────────
  const CHUNK_SIZE = 512 * 1024;
  const fetchWithTimeout = async (url: string, opts: RequestInit, ms = 30000) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(tid); }
  };

  const uploadOneFile = async (file: File, folderId: string | null) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    for (let i = 0; i < totalChunks; i++) {
      setUploadProgress(`${file.name}|${Math.round((i / totalChunks) * 90)}`);
      const fd = new FormData();
      fd.append('chunk', file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), `chunk_${i}`);
      fd.append('uploadId', uploadId); fd.append('chunkIndex', String(i));
      let r: Response;
      try { r = await fetchWithTimeout('/api/file-items/chunk', { method: 'POST', body: fd }); }
      catch (e) { showToast(`업로드 실패: ${e instanceof Error ? e.message : '오류'}`); return false; }
      if (!r.ok) { showToast(`업로드 실패 (${r.status}): ${await r.text().catch(() => '')}`); return false; }
    }
    setUploadProgress(`${file.name}|95`);
    let cr: Response;
    try { cr = await fetchWithTimeout('/api/file-items/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId, fileName: file.name, folderId, fileType: file.type, totalChunks, fileSize: file.size }) }, 60000); }
    catch (e) { showToast(`저장 실패: ${e instanceof Error ? e.message : '오류'}`); return false; }
    if (!cr.ok) { showToast(`저장 실패 (${cr.status})`); return false; }
    setUploadProgress(`${file.name}|100`);
    return true;
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) { await uploadOneFile(file, selectedFolder); }
    setUploading(false); setUploadProgress('');
    await loadFiles();
  };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); handleUpload(e.dataTransfer.files); };

  // ── 폴더 CRUD ──────────────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim() || folderCreatingRef.current) return;
    folderCreatingRef.current = true; setFolderSaving(true);
    try {
      await fetch('/api/file-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFolderName.trim(), parent_id: selectedFolder || null }) });
      setNewFolderName(''); setShowNewFolder(false);
      if (selectedFolder) setExpandedIds(prev => new Set([...prev, selectedFolder]));
      await loadFolders();
    } finally { folderCreatingRef.current = false; setFolderSaving(false); }
  };

  const deleteFolder = async (folder: FileFolder) => {
    if (!isAdmin) { showToast('관리자만 폴더를 삭제할 수 있습니다.'); return; }
    if (!confirm(`"${folder.name}" 폴더를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/file-folders/${folder.id}`, { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) { showToast(j.error || '삭제 실패'); return; }
    if (selectedFolder === folder.id) setSelectedFolder(folder.parent_id || null);
    await loadFolders();
  };

  const renameFolder = async (folder: FileFolder, newName: string) => {
    if (!newName.trim()) return;
    await fetch(`/api/file-folders/${folder.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
    setRenameTarget(null); await loadFolders();
  };

  const renameFile = async (item: FileItem, newName: string) => {
    if (!newName.trim()) return;
    await fetch(`/api/file-items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: newName.trim() }) });
    setRenameTarget(null); await loadFiles();
  };

  // ── 파일 액션 ──────────────────────────────────────────────────────────────
  const shareFile = async (item: FileItem) => {
    const r = await fetch(`/api/file-items/${item.id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInDays: 30 }) });
    const j = await r.json();
    if (j.url) { await navigator.clipboard.writeText(j.url).catch(() => {}); showToast('공유 링크 복사됨'); await loadFiles(); }
  };

  const copyFile = async (item: FileItem) => {
    const r = await fetch(`/api/file-items/${item.id}/download`);
    if (!r.ok) { showToast('복사 실패'); return; }
    const blob = await r.blob();
    const parts = item.file_name.split('.');
    const ext = parts.length > 1 ? '.' + parts.pop() : '';
    const fd = new FormData();
    fd.append('file', new Blob([blob], { type: item.file_type }), `${parts.join('.')}_복사본${ext}`);
    if (item.folder_id) fd.append('folderId', item.folder_id);
    await fetch('/api/file-items', { method: 'POST', body: fd });
    showToast('복사 완료'); await loadFiles();
  };

  const deleteFile = async (item: FileItem) => {
    if (!confirm(`"${item.file_name}"을(를) 삭제하시겠습니까?`)) return;
    await fetch(`/api/file-items/${item.id}`, { method: 'DELETE' });
    await loadFiles();
  };

  const moveItem = async (folderId: string | null) => {
    if (!moveTarget) return;
    if (moveTarget.kind === 'file') {
      await fetch(`/api/file-items/${moveTarget.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: folderId }) });
      await loadFiles();
    } else {
      await fetch(`/api/file-folders/${moveTarget.folder.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: moveTarget.folder.name, parent_id: folderId }) });
      await loadFolders();
    }
    setMoveTarget(null); showToast('이동 완료');
  };

  // ── 견적서 추출 ─────────────────────────────────────────────────────────────
  const openMapping = async (file: FileItem) => {
    setMappingFile(file); setNameCol(null); setSpecCol(null); setPriceCol(null); setStartRow(1); setPreviewData(null);
    setPreviewLoading(true);
    const r = await fetch(`/api/file-items/${file.id}/preview`);
    const j = await r.json();
    setPreviewLoading(false);
    if (j.error) { showToast(j.error); setMappingFile(null); return; }
    setPreviewData(j);
  };
  const cycleCol = (ci: number) => {
    if (nameCol === ci) { setNameCol(null); return; } if (specCol === ci) { setSpecCol(null); return; } if (priceCol === ci) { setPriceCol(null); return; }
    if (nameCol === null) { setNameCol(ci); return; } if (specCol === null) { setSpecCol(ci); return; } if (priceCol === null) { setPriceCol(ci); }
  };
  const colRole = (ci: number) => nameCol === ci ? 'name' : specCol === ci ? 'spec' : priceCol === ci ? 'price' : null;
  const runExtract = async () => {
    if (!mappingFile || nameCol === null) return;
    setExtracting(mappingFile.id);
    const r = await fetch(`/api/file-items/${mappingFile.id}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nameCol, specCol: specCol ?? null, priceCol: priceCol ?? null, startRow }) });
    const j = await r.json();
    setExtracting(null);
    if (j.error) { showToast(`추출 실패: ${j.error}`); return; }
    showToast(`추출 완료 — ${j.count}개 항목`); setMappingFile(null); await loadQuotes(); setTab('quotes');
  };

  // ── 컨텍스트 메뉴 핸들러 ────────────────────────────────────────────────────
  const openCtx = (e: React.MouseEvent, target: CtxTarget) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ pos: { x: e.clientX, y: e.clientY }, target });
  };

  const handleCtxAction = (action: string) => {
    if (!ctx) return;
    const t = ctx.target;
    if (t.kind === 'file') {
      const item = t.item;
      if (action === 'download') { const a = document.createElement('a'); a.href = `/api/file-items/${item.id}/download`; a.download = item.file_name; a.click(); }
      else if (action === 'share') shareFile(item);
      else if (action === 'copyLink') { navigator.clipboard.writeText(`${location.origin}/share/${item.share_token}`).catch(() => {}); showToast('링크 복사됨'); }
      else if (action === 'copy') copyFile(item);
      else if (action === 'move') setMoveTarget({ kind: 'file', item });
      else if (action === 'rename') { setRenameTarget({ kind: 'file', item }); setRenameName(item.file_name); }
      else if (action === 'extract') openMapping(item);
      else if (action === 'delete') deleteFile(item);
    } else if (t.kind === 'folder') {
      const folder = t.folder;
      if (action === 'openFolder') selectFolder(folder.id);
      else if (action === 'renameFolder') { setRenameTarget({ kind: 'folder', folder }); setRenameName(folder.name); }
      else if (action === 'moveFolder') setMoveTarget({ kind: 'folder', folder });
      else if (action === 'deleteFolder') deleteFolder(folder);
    } else {
      if (action === 'newFolder') setShowNewFolder(true);
      else if (action === 'uploadFile') fileRef.current?.click();
    }
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <AppHeader title="파일" />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── 사이드바 ── */}
        <div className="w-48 shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-border shrink-0">
            <button onClick={() => setShowNewFolder(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <FolderPlus className="w-3.5 h-3.5" /> 새 폴더
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-1.5 px-1 space-y-0.5">
            <div
              className={cn('flex items-center gap-2 py-1 px-2 rounded-lg text-xs cursor-pointer transition-colors select-none',
                selectedFolder === null ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
              onClick={() => selectFolder(null)}>
              <FolderOpen className="w-3.5 h-3.5 shrink-0" /> <span>전체</span>
            </div>
            {folderTree.map(f => (
              <TreeNode key={f.id} folder={f} depth={0}
                selectedId={selectedFolder} expandedIds={expandedIds}
                onSelect={selectFolder} onToggle={toggleExpand}
                onCtx={(e, folder) => openCtx(e, { kind: 'folder', folder })} />
            ))}
          </nav>
        </div>

        {/* ── 메인 ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* 탭 (견적서) */}
          {isQuotesFolder && (
            <div className="flex border-b border-border px-4 pt-3 gap-4 shrink-0">
              <button onClick={() => setTab('files')} className={cn('pb-2 text-sm font-medium border-b-2 transition-colors', tab === 'files' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>파일</button>
              <button onClick={() => { setTab('quotes'); loadQuotes(); }} className={cn('pb-2 text-sm font-medium border-b-2 transition-colors', tab === 'quotes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>견적 데이터</button>
            </div>
          )}

          {/* 툴바 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            {/* 브레드크럼 */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1 min-w-0">
              <button onClick={() => selectFolder(null)} className="hover:text-foreground shrink-0 font-medium">전체</button>
              {breadcrumb.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 min-w-0">
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />
                  <button onClick={() => selectFolder(f.id)} className={cn('hover:text-foreground truncate max-w-28', i === breadcrumb.length - 1 ? 'text-foreground font-medium' : '')}>{f.name}</button>
                </span>
              ))}
            </div>
            <div className="relative w-40 shrink-0">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="검색..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 shrink-0" onClick={() => setView('grid')}><Grid3X3 className="w-3.5 h-3.5" /></Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 shrink-0" onClick={() => setView('list')}><List className="w-3.5 h-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0 text-xs" onClick={() => setShowNewFolder(true)}><FolderPlus className="w-3.5 h-3.5" />폴더</Button>
            <Button size="sm" className="h-8 gap-1.5 shrink-0 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? '업로드 중...' : '업로드'}
            </Button>
          </div>

          {/* 업로드 진행바 */}
          {uploadProgress && (() => {
            const [fname, pctStr] = uploadProgress.split('|');
            const pct = Number(pctStr) || 0;
            return (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 shrink-0">
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                  <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{fname}</span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* 파일/폴더 콘텐츠 */}
          {(!isQuotesFolder || tab === 'files') && (
            <div className="flex-1 overflow-y-auto"
              onContextMenu={e => { if ((e.target as HTMLElement).closest('[data-item]')) return; openCtx(e, { kind: 'space' }); }}>
              {loading && <div className="flex items-center justify-center h-24 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />불러오는 중...</div>}

              {!loading && subFolders.length === 0 && filteredFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center h-52 text-muted-foreground"
                  onContextMenu={e => { e.preventDefault(); openCtx(e, { kind: 'space' }); }}>
                  <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
                    <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">비어 있음</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">파일을 드래그하거나 우클릭하여 업로드</p>
                </div>
              )}

              {!loading && (view === 'grid' ? (
                <div className="p-4 space-y-5">
                  {/* 폴더 섹션 */}
                  {subFolders.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-1">폴더</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {subFolders.map(folder => (
                          <div key={folder.id} data-item="folder"
                            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer hover:bg-accent group select-none transition-colors"
                            onClick={() => selectFolder(folder.id)}
                            onDoubleClick={() => selectFolder(folder.id)}
                            onContextMenu={e => openCtx(e, { kind: 'folder', folder })}>
                            <div className="relative">
                              <FolderOpen className="w-10 h-10 text-amber-400 drop-shadow-sm group-hover:text-amber-500 transition-colors" />
                              {folder.is_system && <Sparkles className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-500" />}
                            </div>
                            <p className="text-xs text-center truncate w-full font-medium leading-tight">{folder.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 파일 섹션 */}
                  {filteredFiles.length > 0 && (
                    <div>
                      {subFolders.length > 0 && <p className="text-xs font-medium text-muted-foreground mb-2 px-1">파일</p>}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {filteredFiles.map(file => (
                          <div key={file.id} data-item="file"
                            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer hover:bg-accent group select-none transition-colors relative"
                            onDoubleClick={() => { const a = document.createElement('a'); a.href = `/api/file-items/${file.id}/download`; a.download = file.file_name; a.click(); }}
                            onContextMenu={e => openCtx(e, { kind: 'file', item: file })}>
                            <div className="w-10 h-10">
                              <FileIcon type={file.file_type} name={file.file_name} size={40} />
                            </div>
                            {renameTarget?.kind === 'file' && renameTarget.item.id === file.id ? (
                              <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)}
                                className="w-full text-xs text-center border border-primary rounded px-1 outline-none bg-background"
                                onBlur={() => renameFile(file, renameName)}
                                onKeyDown={e => { if (e.key === 'Enter') renameFile(file, renameName); if (e.key === 'Escape') setRenameTarget(null); }} />
                            ) : (
                              <p className="text-xs text-center truncate w-full leading-tight">{file.file_name}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground/60">{fmtSize(file.file_size)}</p>
                            {file.share_token && <Link2 className="absolute top-1.5 right-1.5 w-3 h-3 text-blue-400" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // 리스트 뷰
                <div className="px-3 py-2">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground">이름</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-20">크기</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-24">업로드</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-20">날짜</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subFolders.map(folder => (
                        <tr key={folder.id} data-item="folder"
                          className="hover:bg-accent/50 cursor-pointer group rounded-lg"
                          onDoubleClick={() => selectFolder(folder.id)}
                          onContextMenu={e => openCtx(e, { kind: 'folder', folder })}>
                          <td className="px-2 py-1.5 rounded-l-lg">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                              {renameTarget?.kind === 'folder' && renameTarget.folder.id === folder.id ? (
                                <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)}
                                  className="text-sm border border-primary rounded px-1 outline-none bg-background"
                                  onBlur={() => renameFolder(folder, renameName)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameFolder(folder, renameName); if (e.key === 'Escape') setRenameTarget(null); }} />
                              ) : <span className="text-sm font-medium">{folder.name}</span>}
                              {folder.is_system && <Sparkles className="w-3 h-3 text-amber-400" />}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">—</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{folder.created_by}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{fmtDate(folder.created_at)}</td>
                          <td className="px-2 py-1.5 rounded-r-lg">
                            <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted" onClick={e => openCtx(e, { kind: 'folder', folder })}>
                              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredFiles.map(file => (
                        <tr key={file.id} data-item="file"
                          className="hover:bg-accent/50 cursor-pointer group"
                          onDoubleClick={() => { const a = document.createElement('a'); a.href = `/api/file-items/${file.id}/download`; a.download = file.file_name; a.click(); }}
                          onContextMenu={e => openCtx(e, { kind: 'file', item: file })}>
                          <td className="px-2 py-1.5 rounded-l-lg">
                            <div className="flex items-center gap-2">
                              <FileIcon type={file.file_type} name={file.file_name} size={20} />
                              {renameTarget?.kind === 'file' && renameTarget.item.id === file.id ? (
                                <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)}
                                  className="text-sm border border-primary rounded px-1 outline-none bg-background flex-1"
                                  onBlur={() => renameFile(file, renameName)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameFile(file, renameName); if (e.key === 'Escape') setRenameTarget(null); }} />
                              ) : <span className="text-sm truncate max-w-64">{file.file_name}</span>}
                              {file.share_token && <Link2 className="w-3 h-3 text-blue-400 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground tabular-nums">{fmtSize(file.file_size)}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{file.uploaded_by}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{fmtDate(file.created_at)}</td>
                          <td className="px-2 py-1.5 rounded-r-lg">
                            <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted" onClick={e => openCtx(e, { kind: 'file', item: file })}>
                              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* 견적 데이터 탭 */}
          {isQuotesFolder && tab === 'quotes' && (
            <div className="flex-1 overflow-y-auto p-4">
              {quotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Sparkles className="w-8 h-8 mb-2 text-amber-300" />
                  <p className="text-sm">Excel 파일을 우클릭 → 열 매핑 추출</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">공급업체 / 파일</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-24">견적일</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">제품명</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">사양</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-28">가격</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-16">원본</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {quotes.flatMap(q => {
                        const items: { name: string; spec?: string; price?: string }[] = JSON.parse(q.items_json || '[]');
                        if (!items.length) return [<tr key={q.id}><td className="px-3 py-2 text-xs text-muted-foreground" colSpan={6}>{q.file_name} — 항목 없음</td></tr>];
                        return items.map((item, i) => (
                          <tr key={`${q.id}-${i}`} className="hover:bg-muted/30">
                            {i === 0 && <td className="px-3 py-2 text-xs" rowSpan={items.length}><div className="font-medium">{q.supplier_name || '—'}</div><div className="text-[10px] text-muted-foreground">{q.file_name}</div></td>}
                            {i === 0 && <td className="px-3 py-2 text-xs text-muted-foreground" rowSpan={items.length}>{q.quote_date || '—'}</td>}
                            <td className="px-3 py-2 text-xs">{item.name}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.spec || '—'}</td>
                            <td className="px-3 py-2 text-xs font-mono text-blue-700">{item.price || '—'}</td>
                            {i === 0 && <td className="px-3 py-2" rowSpan={items.length}><a href={`/api/file-items/${q.file_item_id}/download`} download className="flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="w-3 h-3" />열기</a></td>}
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 상태바 */}
          <div className="shrink-0 border-t border-border px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground bg-muted/20">
            <span>{subFolders.length > 0 && `폴더 ${subFolders.length}개`}{subFolders.length > 0 && filteredFiles.length > 0 && ', '}{filteredFiles.length > 0 && `파일 ${filteredFiles.length}개`}{subFolders.length === 0 && filteredFiles.length === 0 && '비어 있음'}</span>
            {selectedFolder && <span className="ml-auto">{breadcrumb.map(f => f.name).join(' › ')}</span>}
          </div>
        </div>
      </div>

      {/* ── 컨텍스트 메뉴 ── */}
      {ctx && <CtxMenu pos={ctx.pos} target={ctx.target} onClose={() => setCtx(null)} onAction={handleCtxAction} />}

      {/* ── 이동 다이얼로그 ── */}
      {moveTarget && <MoveDialog folders={folders} currentFolderId={selectedFolder} onMove={moveItem} onClose={() => setMoveTarget(null)} />}

      {/* ── 새 폴더 모달 ── */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-popover rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-base mb-1">새 폴더 만들기</h3>
            {selectedFolder && <p className="text-xs text-muted-foreground mb-3">📁 {breadcrumb.map(f => f.name).join(' › ')} 안에 생성</p>}
            <Input placeholder="폴더 이름" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }} />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>취소</Button>
              <Button size="sm" onClick={createFolder} disabled={folderSaving || !newFolderName.trim()}>
                {folderSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : '만들기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 열 매핑 모달 ── */}
      {mappingFile && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-popover rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-semibold text-base">열 매핑 — {mappingFile.file_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">열 헤더 클릭: 파란=제품명 → 보라=사양 → 초록=가격 → 해제</p>
              </div>
              <button onClick={() => setMappingFile(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs">데이터 시작 행:</span>
                <input type="number" min={1} value={startRow + 1} onChange={e => setStartRow(Math.max(0, Number(e.target.value) - 1))}
                  className="w-14 h-7 text-sm border border-border rounded px-2 text-center bg-background" />
              </div>
              <div className="flex items-center gap-2 ml-auto text-xs">
                {nameCol !== null && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">제품명: {previewData?.colHeaders[nameCol]}</span>}
                {specCol !== null && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">사양: {previewData?.colHeaders[specCol]}</span>}
                {priceCol !== null && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">가격: {previewData?.colHeaders[priceCol]}</span>}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewLoading && <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />파일 읽는 중...</div>}
              {!previewLoading && previewData && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-right pr-2 w-8 border-b border-border pb-1 text-muted-foreground">#</th>
                      {previewData.colHeaders.map((h, ci) => {
                        const role = colRole(ci);
                        return (
                          <th key={ci} onClick={() => cycleCol(ci)}
                            className={cn('border border-border px-2 py-1.5 text-center cursor-pointer font-medium whitespace-nowrap transition-colors',
                              role === 'name' ? 'bg-blue-500 text-white' : role === 'spec' ? 'bg-purple-500 text-white' : role === 'price' ? 'bg-green-500 text-white' : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground')}>
                            {h}
                            {role === 'name' && <span className="block text-[9px] opacity-80">제품명</span>}
                            {role === 'spec' && <span className="block text-[9px] opacity-80">사양</span>}
                            {role === 'price' && <span className="block text-[9px] opacity-80">가격</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.map((row, ri) => (
                      <tr key={ri} className={cn(ri < startRow ? 'opacity-30 bg-muted/40' : 'hover:bg-muted/30')}>
                        <td className="text-right pr-2 text-muted-foreground tabular-nums">{ri + 1}</td>
                        {row.map((cell, ci) => {
                          const role = colRole(ci);
                          return (
                            <td key={ci} onClick={() => cycleCol(ci)}
                              className={cn('border border-border px-2 py-1 max-w-40 truncate cursor-pointer',
                                role === 'name' ? 'bg-blue-50 text-blue-900' : role === 'spec' ? 'bg-purple-50 text-purple-900' : role === 'price' ? 'bg-green-50 text-green-900' : '')}>
                              {cell ?? ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0 bg-muted/30">
              <p className="text-xs text-muted-foreground">{nameCol === null ? '열 헤더를 클릭해 제품명부터 선택하세요' : '선택 완료 후 추출하기'}</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMappingFile(null)}>취소</Button>
                <Button size="sm" onClick={runExtract} disabled={nameCol === null || extracting === mappingFile.id}>
                  {extracting === mappingFile.id ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />추출 중...</> : '추출하기'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 max-w-sm">
          <Check className="w-4 h-4 shrink-0" /> <span className="truncate">{toast}</span>
        </div>
      )}
    </div>
  );
}
