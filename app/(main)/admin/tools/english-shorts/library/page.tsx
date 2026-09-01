'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Clapperboard, Upload, Trash2, Video, Plus, Camera, FileVideo } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SourceRow {
  id: string; sourceKind: string; originalFileName: string | null; extension: string | null;
  fileSize: number | null; width: number | null; height: number | null; durationSec: number | null;
  videoCodec: string | null; audioCodec: string | null; createdAt: string;
}

const fmtSize = (b: number | null) => b == null ? '-' : b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;
const fmtDuration = (s: number | null) => s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function SourceLibraryPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [showMobileUpload, setShowMobileUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const load = () => {
    setLoading(true);
    fetch('/api/admin-tools/english-shorts/sources').then(r => r.json()).then(j => {
      setSources(Array.isArray(j.sources) ? j.sources : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin-tools/english-shorts/sources', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setUploadMsg(j.error || '업로드 실패'); return; }
      setUploadMsg(j.duplicate ? '이미 있는 파일이라 기존 소스를 재사용했습니다.' : '업로드 완료');
      load();
    } catch (e) {
      setUploadMsg('네트워크 오류: ' + String(e));
    } finally {
      setUploading(false);
      setTimeout(() => setUploadMsg(null), 4000);
    }
  };

  const removeSource = async (id: string) => {
    if (!confirm('이 소스를 삭제할까요? (다른 프로젝트에서 참조 중이면 참조는 유지됩니다)')) return;
    const res = await fetch(`/api/admin-tools/english-shorts/sources/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  /** 사진첩과 동일한 드래그앤드롭 업로드(요청서 Phase19 — Windows WebView2에서
   * disable_drag_drop_handler()가 이미 전역 적용돼 있어 별도 Tauri 쪽 코드
   * 없이도 동작해야 함). */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('video/'));
    if (file) upload(file);
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="소스 클립 라이브러리" icon={<Clapperboard className="w-5 h-5" />}
        actions={
          !isMobile && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              영상 업로드
            </button>
          )
        }
      />
      <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      {/* 모바일 FAB "촬영" 옵션 전용 — 사진첩과 동일 패턴(요청서 Phase18), capture 속성으로 카메라 앱을 바로 연다. */}
      <input ref={cameraInputRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; setShowMobileUpload(false); }} />

      <div
        className={cn('flex-1 overflow-auto p-4 lg:p-6 space-y-4 relative', dragOver && 'ring-2 ring-primary ring-inset')}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 z-40 bg-primary/5 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
            <div className="bg-background rounded-lg px-4 py-3 shadow-lg text-sm font-medium">여기에 놓아서 업로드</div>
          </div>
        )}
        {uploadMsg && (
          <div className="px-4 py-2.5 rounded-lg text-sm bg-muted border">{uploadMsg}</div>
        )}

        {isMobile && (
          <button
            type="button"
            onClick={() => setShowMobileUpload(true)}
            disabled={uploading}
            className="fixed right-4 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            aria-label="영상 올리기"
          >
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
          </button>
        )}
        {showMobileUpload && (
          <BottomSheet onClose={() => setShowMobileUpload(false)} title="영상 올리기">
            <div className="p-3 space-y-1.5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button type="button" onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-sm">
                <Camera className="w-5 h-5 text-primary" />촬영
              </button>
              <button type="button" onClick={() => { fileInputRef.current?.click(); setShowMobileUpload(false); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-sm">
                <FileVideo className="w-5 h-5 text-primary" />갤러리/파일에서 선택
              </button>
            </div>
          </BottomSheet>
        )}

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Video className="w-10 h-10" />
              <p className="text-sm">업로드된 소스 클립이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">파일명</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">포맷</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">해상도</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">길이</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">코덱</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">용량</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">업로드일</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 truncate max-w-[220px]">{s.originalFileName || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground uppercase">{s.extension || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.width && s.height ? `${s.width}×${s.height}` : '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDuration(s.durationSec)}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{[s.videoCodec, s.audioCodec].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmtSize(s.fileSize)}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(s.createdAt).toLocaleDateString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeSource(s.id)} className="text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
