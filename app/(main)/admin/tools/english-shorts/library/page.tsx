'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Clapperboard, Upload, Trash2, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="소스 클립 라이브러리" icon={<Clapperboard className="w-5 h-5" />}
        actions={
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            영상 업로드
          </button>
        }
      />
      <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />

      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        {uploadMsg && (
          <div className="px-4 py-2.5 rounded-lg text-sm bg-muted border">{uploadMsg}</div>
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
          )}
        </div>
      </div>
    </div>
  );
}
