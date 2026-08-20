'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Upload, FolderPlus, Grid3X3, List, Download, Link2, Copy,
  Trash2, Folder, FolderOpen, ChevronRight, FileText, FileSpreadsheet,
  File, X, Edit2, Check, AlertCircle, Loader2, Sparkles, ExternalLink,
  FolderX, MoreVertical
} from 'lucide-react';

interface FileFolder {
  id: string; name: string; parent_id: string | null; is_system: number;
  description: string | null; created_by: string; created_at: string;
}
interface FileItem {
  id: string; business_id: string; folder_id: string | null; folder_name?: string;
  file_name: string; file_path: string; file_size: number; file_type: string;
  category: string; share_token: string | null; share_expires_at: string | null;
  uploaded_by: string; uploaded_by_id: string; created_at: string;
}
interface QuoteExtraction {
  id: string; file_id: string; file_name: string; file_item_id: string;
  supplier_name: string | null; quote_date: string | null;
  items_json: string; status: string; created_at: string;
}

const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', year: '2-digit' }) : '';

function FileIcon({ type, name, size = 32 }: { type: string; name: string; size?: number }) {
  const s = `${size}px`;
  if (type?.includes('pdf') || name?.toLowerCase().endsWith('.pdf')) return <FileText style={{ width: s, height: s }} className="text-red-500" />;
  if (type?.includes('sheet') || name?.match(/\.(xlsx?|csv)$/i)) return <FileSpreadsheet style={{ width: s, height: s }} className="text-green-600" />;
  if (type?.includes('word') || name?.match(/\.docx?$/i)) return <FileText style={{ width: s, height: s }} className="text-blue-600" />;
  return <File style={{ width: s, height: s }} className="text-muted-foreground" />;
}

export default function FilesPage() {
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteExtraction[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = 전체
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tab, setTab] = useState<'files' | 'quotes'>('files');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 폴더 생성 모달
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);

  // 파일 메뉴
  const [menuFile, setMenuFile] = useState<FileItem | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // 공유 링크 toast
  const [toast, setToast] = useState('');
  const [extracting, setExtracting] = useState<string | null>(null);

  // 폴더 이름 편집
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  const loadFolders = useCallback(async () => {
    const r = await fetch('/api/file-folders');
    const j = await r.json();
    setFolders(j.data || []);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedFolder === 'root') params.set('folderId', 'root');
    else if (selectedFolder) params.set('folderId', selectedFolder);
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

  // 파일 업로드
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      setUploadProgress(`업로드 중: ${file.name}`);
      const fd = new FormData();
      fd.append('file', file);
      if (selectedFolder && selectedFolder !== 'root') fd.append('folderId', selectedFolder);
      const r = await fetch('/api/file-items', { method: 'POST', body: fd });
      if (!r.ok) {
        const err = await r.json();
        setToast(`업로드 실패: ${err.error}`);
        setTimeout(() => setToast(''), 3000);
      }
    }
    setUploading(false);
    setUploadProgress('');
    await loadFiles();
    // 견적서 폴더에 업로드했으면 자동 추출 실행
    if (selectedFolder === 'folder_system_quotes') {
      setToast('업로드 완료. 견적서 자동 추출 중...');
      setTimeout(() => setToast(''), 3000);
    }
  };

  // 드래그 앤 드롭
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  // 폴더 생성
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setFolderSaving(true);
    await fetch('/api/file-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    setNewFolderName('');
    setShowNewFolder(false);
    setFolderSaving(false);
    await loadFolders();
  };

  // 폴더 이름 저장
  const saveEditFolder = async (id: string) => {
    if (!editFolderName.trim()) return;
    await fetch(`/api/file-folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editFolderName.trim() }),
    });
    setEditFolderId(null);
    await loadFolders();
  };

  // 공유 링크 생성
  const createShareLink = async (file: FileItem) => {
    const r = await fetch(`/api/file-items/${file.id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays: 30 }),
    });
    const j = await r.json();
    if (j.url) {
      await navigator.clipboard.writeText(j.url).catch(() => {});
      setToast(`링크 복사됨: ${j.url}`);
      setTimeout(() => setToast(''), 4000);
      await loadFiles();
    }
    setMenuFile(null);
  };

  // 파일 복사 (같은 폴더에 복사본 생성)
  const copyFile = async (file: FileItem) => {
    const fd = new FormData();
    // 원본 다운로드 후 재업로드
    const r = await fetch(`/api/file-items/${file.id}/download`);
    if (!r.ok) { setToast('파일 복사 실패'); setTimeout(() => setToast(''), 3000); return; }
    const blob = await r.blob();
    const nameParts = file.file_name.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
    const baseName = nameParts.join('.');
    const copyName = `${baseName}_복사본${ext}`;
    fd.append('file', new Blob([blob], { type: file.file_type }), copyName);
    if (file.folder_id) fd.append('folderId', file.folder_id);
    await fetch('/api/file-items', { method: 'POST', body: fd });
    setMenuFile(null);
    setToast('복사 완료');
    setTimeout(() => setToast(''), 2000);
    await loadFiles();
  };

  // 파일 삭제
  const deleteFile = async (file: FileItem) => {
    if (!confirm(`"${file.file_name}" 을(를) 삭제하시겠습니까?`)) return;
    await fetch(`/api/file-items/${file.id}`, { method: 'DELETE' });
    setMenuFile(null);
    await loadFiles();
  };

  // 견적서 AI 추출
  const extractQuote = async (fileId: string) => {
    setExtracting(fileId);
    const r = await fetch(`/api/file-items/${fileId}/extract`, { method: 'POST' });
    const j = await r.json();
    if (j.error) setToast(`추출 실패: ${j.error}`);
    else { setToast('추출 완료!'); await loadQuotes(); setTab('quotes'); }
    setTimeout(() => setToast(''), 3000);
    setExtracting(null);
    setMenuFile(null);
  };

  const filteredFiles = files.filter(f =>
    !search || f.file_name.toLowerCase().includes(search.toLowerCase()) || (f.category || '').includes(search)
  );
  const systemFolder = folders.find(f => f.id === 'folder_system_quotes');
  const userFolders = folders.filter(f => !f.is_system);

  const isQuotesFolder = selectedFolder === 'folder_system_quotes';

  return (
    <div className="flex flex-col h-full overflow-hidden" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <AppHeader title="파일" />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />

      <div className="flex h-full overflow-hidden">
        {/* 사이드바: 폴더 목록 */}
        <div className="w-48 shrink-0 border-r border-border bg-muted/30 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-border">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="w-4 h-4" /> 폴더 만들기
            </Button>
          </div>
          <nav className="flex-1 py-2 px-1 space-y-0.5">
            <button
              onClick={() => setSelectedFolder(null)}
              className={cn('w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                selectedFolder === null ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <FolderOpen className="w-4 h-4 shrink-0" /> 전체
            </button>
            {/* 시스템 폴더(견적서) */}
            {systemFolder && (
              <button
                onClick={() => setSelectedFolder(systemFolder.id)}
                className={cn('w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                  selectedFolder === systemFolder.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Sparkles className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="truncate">{systemFolder.name}</span>
              </button>
            )}
            {/* 사용자 폴더 */}
            {userFolders.map(folder => (
              <div key={folder.id} className="group relative">
                {editFolderId === folder.id ? (
                  <div className="flex items-center gap-1 px-1">
                    <Input value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                      className="h-6 text-xs py-0" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveEditFolder(folder.id); if (e.key === 'Escape') setEditFolderId(null); }} />
                    <button onClick={() => saveEditFolder(folder.id)}><Check className="w-3.5 h-3.5 text-green-600" /></button>
                    <button onClick={() => setEditFolderId(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedFolder(folder.id)}
                    className={cn('w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors pr-7',
                      selectedFolder === folder.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="truncate flex-1">{folder.name}</span>
                  </button>
                )}
                {editFolderId !== folder.id && (
                  <button
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/20"
                    onClick={() => { setEditFolderId(folder.id); setEditFolderName(folder.name); }}>
                    <Edit2 className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 탭 (견적서 폴더일 때만 표시) */}
          {isQuotesFolder && (
            <div className="flex border-b border-border bg-background px-4 pt-3 gap-4">
              <button onClick={() => setTab('files')}
                className={cn('pb-2 text-sm font-medium border-b-2 transition-colors', tab === 'files' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
                파일 목록
              </button>
              <button onClick={() => { setTab('quotes'); loadQuotes(); }}
                className={cn('pb-2 text-sm font-medium border-b-2 transition-colors', tab === 'quotes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
                견적 데이터 <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">AI</span>
              </button>
            </div>
          )}

          {/* 툴바 */}
          <div className="flex items-center gap-2 p-3 border-b border-border bg-background">
            <div className="relative flex-1 max-w-72">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="파일명, 카테고리 검색..." className="pl-8 h-9" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 ml-auto">
              <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('grid')}>
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('list')}>
                <List className="w-4 h-4" />
              </Button>
            </div>
            <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="hidden sm:inline">{uploading ? '업로드 중...' : '업로드'}</span>
            </Button>
          </div>

          {/* 업로드 진행 */}
          {uploadProgress && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm text-blue-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploadProgress}
            </div>
          )}

          {/* 파일 목록 */}
          {(!isQuotesFolder || tab === 'files') && (
            <div className="flex-1 overflow-y-auto p-4">
              {/* 드래그 안내 */}
              {filteredFiles.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <Upload className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">파일을 여기에 드래그하거나</p>
                  <button className="text-sm text-primary mt-1" onClick={() => fileRef.current?.click()}>클릭하여 업로드</button>
                </div>
              )}
              {loading && <div className="flex items-center justify-center h-24 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...</div>}
              {!loading && filteredFiles.length > 0 && (view === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredFiles.map(file => (
                    <div key={file.id}
                      className="bg-card border border-border rounded-xl p-3 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group relative"
                      onContextMenu={e => { e.preventDefault(); setMenuFile(file); setMenuPos({ x: e.clientX, y: e.clientY }); }}>
                      <div className="flex justify-center mb-3">
                        <FileIcon type={file.file_type} name={file.file_name} size={36} />
                      </div>
                      <p className="text-xs font-medium text-foreground text-center truncate mb-0.5">{file.file_name}</p>
                      <p className="text-[11px] text-muted-foreground text-center">{fmtSize(file.file_size)}</p>
                      <p className="text-[10px] text-muted-foreground text-center mt-0.5">{file.uploaded_by}</p>
                      {file.share_token && (
                        <div className="absolute top-2 right-2">
                          <Link2 className="w-3 h-3 text-blue-500" />
                        </div>
                      )}
                      {/* 빠른 액션 */}
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1">
                        <a href={`/api/file-items/${file.id}/download`} download
                          className="p-1 rounded bg-background shadow-sm border border-border hover:bg-muted"
                          onClick={e => e.stopPropagation()}>
                          <Download className="w-3 h-3 text-muted-foreground" />
                        </a>
                        <button className="p-1 rounded bg-background shadow-sm border border-border hover:bg-muted"
                          onClick={e => { e.stopPropagation(); setMenuFile(file); setMenuPos({ x: e.clientX, y: e.clientY }); }}>
                          <MoreVertical className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">파일명</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-24">크기</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-24">업로드</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-24">날짜</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredFiles.map(file => (
                        <tr key={file.id} className="hover:bg-muted/30 group">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <FileIcon type={file.file_type} name={file.file_name} size={18} />
                              <span className="text-sm truncate max-w-64">{file.file_name}</span>
                              {file.share_token && <Link2 className="w-3 h-3 text-blue-500 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtSize(file.file_size)}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{file.uploaded_by}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(file.created_at)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <a href={`/api/file-items/${file.id}/download`} download className="p-1.5 rounded hover:bg-muted">
                                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                              </a>
                              <button className="p-1.5 rounded hover:bg-muted" onClick={() => createShareLink(file)} title="공유 링크">
                                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              <button className="p-1.5 rounded hover:bg-muted" onClick={() => copyFile(file)} title="복사">
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              {isQuotesFolder && (
                                <button className="p-1.5 rounded hover:bg-amber-50" onClick={() => extractQuote(file.id)} disabled={extracting === file.id} title="AI 추출">
                                  {extracting === file.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                                </button>
                              )}
                              <button className="p-1.5 rounded hover:bg-red-50" onClick={() => deleteFile(file)} title="삭제">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
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
                  <p className="text-sm">견적서 파일을 업로드하고 AI 추출을 실행하면 여기에 표시됩니다.</p>
                  <button className="text-sm text-primary mt-2" onClick={() => setTab('files')}>파일 목록으로</button>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">공급업체</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">견적일</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">제품명</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">가격</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-24">수량/단위</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">원본</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {quotes.flatMap(q => {
                        const items: { name: string; price: string; unit?: string; quantity?: string }[] = JSON.parse(q.items_json || '[]');
                        if (items.length === 0) return [
                          <tr key={q.id}>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground" colSpan={6}>{q.supplier_name || q.file_name} — 추출된 항목 없음</td>
                          </tr>
                        ];
                        return items.map((item, i) => (
                          <tr key={`${q.id}-${i}`} className="hover:bg-muted/30">
                            {i === 0 ? (
                              <td className="px-3 py-2.5 text-xs font-medium" rowSpan={items.length}>
                                <div>{q.supplier_name || '—'}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{q.file_name}</div>
                              </td>
                            ) : null}
                            {i === 0 ? (
                              <td className="px-3 py-2.5 text-xs text-muted-foreground" rowSpan={items.length}>
                                {q.quote_date || '—'}
                              </td>
                            ) : null}
                            <td className="px-3 py-2.5 text-xs">{item.name}</td>
                            <td className="px-3 py-2.5 text-xs font-mono text-blue-700">{item.price}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {[item.quantity, item.unit].filter(Boolean).join(' ')}
                            </td>
                            {i === 0 ? (
                              <td className="px-3 py-2.5" rowSpan={items.length}>
                                <a href={`/api/file-items/${q.file_item_id}/download`} download
                                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  <ExternalLink className="w-3 h-3" /> 열기
                                </a>
                              </td>
                            ) : null}
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {menuFile && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuFile(null)} />
          <div className="fixed z-50 bg-popover border border-border rounded-xl shadow-xl py-1 w-44 text-sm"
            style={{ left: menuPos.x, top: menuPos.y }}>
            <a href={`/api/file-items/${menuFile.id}/download`} download
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer"
              onClick={() => setMenuFile(null)}>
              <Download className="w-3.5 h-3.5" /> 다운로드
            </a>
            <button className="flex items-center gap-2 px-3 py-2 hover:bg-muted w-full text-left" onClick={() => createShareLink(menuFile)}>
              <Link2 className="w-3.5 h-3.5" /> 공유 링크 만들기
            </button>
            {menuFile.share_token && (
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-muted w-full text-left text-xs text-muted-foreground"
                onClick={() => { navigator.clipboard.writeText(`${location.origin}/share/${menuFile.share_token}`).catch(() => {}); setToast('링크 복사됨'); setTimeout(() => setToast(''), 2000); setMenuFile(null); }}>
                <Link2 className="w-3.5 h-3.5" /> 링크 복사
              </button>
            )}
            <button className="flex items-center gap-2 px-3 py-2 hover:bg-muted w-full text-left" onClick={() => copyFile(menuFile)}>
              <Copy className="w-3.5 h-3.5" /> 복사하기
            </button>
            {(menuFile.file_type?.includes('pdf') || menuFile.file_name?.match(/\.(pdf|xlsx?|csv)$/i)) && (
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-amber-50 w-full text-left text-amber-700"
                onClick={() => extractQuote(menuFile.id)} disabled={extracting === menuFile.id}>
                {extracting === menuFile.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                AI 견적 추출
              </button>
            )}
            <div className="border-t border-border my-1" />
            <button className="flex items-center gap-2 px-3 py-2 hover:bg-red-50 w-full text-left text-red-600" onClick={() => deleteFile(menuFile)}>
              <Trash2 className="w-3.5 h-3.5" /> 삭제
            </button>
          </div>
        </>
      )}

      {/* 폴더 만들기 모달 */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-popover rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-base mb-4">새 폴더 만들기</h3>
            <Input placeholder="폴더 이름" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }} />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>취소</Button>
              <Button size="sm" onClick={createFolder} disabled={folderSaving || !newFolderName.trim()}>
                {folderSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : '만들기'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> 한번 만든 폴더는 관리자만 삭제할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check className="w-4 h-4 shrink-0" /> <span className="truncate">{toast}</span>
        </div>
      )}
    </div>
  );
}
