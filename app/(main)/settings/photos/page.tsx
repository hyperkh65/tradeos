'use client';

import { AppHeader } from '@/components/layout/header';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, HardDrive, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhotoSettings {
  maxUploadSizeMb: number; maxFilesPerBatch: number; allowedExtensions: string[];
  trashRetentionDays: number; allowExternalShare: boolean; maxExternalShareDays: number;
  allowPasswordlessExternalShare: boolean; defaultAllowOriginalDownload: boolean; defaultWatermark: boolean;
  showExifGps: boolean; duplicatePolicy: 'ask' | 'reuse' | 'always_new';
  thumbSmallPx: number; thumbMediumPx: number; previewLargePx: number;
}

interface StorageStats {
  totalPhotos: number; trashedPhotos: number; originalBytes: number; derivativeBytes: number; totalBytes: number;
  last30dPhotos: number; last30dBytes: number; nasMode: 'local' | 'webdav';
  nasFreeBytes: number | null; nasTotalBytes: number | null; nasFreePercent: number | null;
}

interface MissingFile { photoId: string; kind: string; originalFileName: string; storedPath: string }
interface ScanResult { scannedAt: string; totalChecked: number; missing: MissingFile[]; orphans: string[] }

const fmtBytes = (n: number) => {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
};

export default function PhotoSettingsPage() {
  const [settings, setSettings] = useState<PhotoSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const loadSettings = useCallback(() => {
    fetch('/api/photos/settings').then(r => r.json()).then(j => { if (j.settings) setSettings(j.settings); });
  }, []);
  const loadStats = useCallback(() => {
    setStatsLoading(true);
    fetch('/api/photos/admin/storage-stats').then(r => r.json()).then(j => { if (j.stats) setStats(j.stats); }).finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { loadSettings(); loadStats(); }, [loadSettings, loadStats]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/photos/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const j = await res.json();
      if (res.ok && j.settings) { setSettings(j.settings); setMsg('저장됐습니다.'); setTimeout(() => setMsg(null), 2500); }
      else setMsg(j.error ?? '저장 실패');
    } finally { setSaving(false); }
  };

  const runScan = async () => {
    setScanning(true);
    setScan(null);
    try {
      const res = await fetch('/api/photos/admin/integrity-scan', { method: 'POST' });
      const j = await res.json();
      if (res.ok) setScan(j.result);
      else setMsg(j.error ?? '검사 실패');
    } finally { setScanning(false); }
  };

  if (!settings) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <AppHeader title="사진첩 설정" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="사진첩 설정" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {msg && (
            <div className="px-4 py-2.5 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />{msg}
            </div>
          )}

          {/* ── 저장공간 대시보드 ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base flex items-center gap-1.5"><HardDrive className="w-4 h-4" />저장공간 대시보드</h2>
              <button onClick={loadStats} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RefreshCw className={cn('w-3.5 h-3.5', statsLoading && 'animate-spin')} />새로고침
              </button>
            </div>
            {statsLoading || !stats ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">사진 수(휴지통 제외)</p>
                  <p className="text-lg font-semibold mt-1">{stats.totalPhotos.toLocaleString()}장</p>
                  <p className="text-xs text-muted-foreground mt-0.5">휴지통 {stats.trashedPhotos.toLocaleString()}장</p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">총 저장용량</p>
                  <p className="text-lg font-semibold mt-1">{fmtBytes(stats.totalBytes)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">원본 {fmtBytes(stats.originalBytes)} · 파생본 {fmtBytes(stats.derivativeBytes)}</p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">최근 30일 업로드</p>
                  <p className="text-lg font-semibold mt-1">{stats.last30dPhotos.toLocaleString()}장</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtBytes(stats.last30dBytes)}</p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">NAS 여유공간 ({stats.nasMode === 'local' ? '로컬 FS' : 'WebDAV'})</p>
                  {stats.nasFreeBytes != null && stats.nasFreePercent != null ? (
                    <>
                      <p className={cn('text-lg font-semibold mt-1', stats.nasFreePercent < 10 ? 'text-red-600' : stats.nasFreePercent < 20 ? 'text-amber-600' : '')}>
                        {fmtBytes(stats.nasFreeBytes)} ({stats.nasFreePercent.toFixed(1)}%)
                      </p>
                      {stats.nasFreePercent < 20 && (
                        <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />여유공간이 {stats.nasFreePercent < 10 ? '10%' : '20%'} 미만입니다</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">알 수 없음(WebDAV 모드)</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── 무결성 검사 ── */}
          <section>
            <h2 className="font-semibold text-base flex items-center gap-1.5 mb-1"><ShieldAlert className="w-4 h-4" />무결성 검사</h2>
            <p className="text-xs text-muted-foreground mb-3">DB에는 있는데 NAS에 파일이 없는 경우(Missing), NAS에는 있는데 DB에 없는 경우(Orphan)를 찾습니다.</p>
            <button onClick={runScan} disabled={scanning}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
              {scanning && <Loader2 className="w-4 h-4 animate-spin" />}지금 검사 실행
            </button>

            {scan && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {new Date(scan.scannedAt).toLocaleString('ko-KR')} 기준 · 파일 {scan.totalChecked.toLocaleString()}개 검사
                </p>
                {scan.missing.length === 0 && scan.orphans.length === 0 ? (
                  <p className="text-sm text-green-600 flex items-center gap-1.5 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-4 h-4" />이상 없음
                  </p>
                ) : (
                  <>
                    {scan.missing.length > 0 && (
                      <div className="border border-red-200 rounded-xl overflow-hidden">
                        <div className="bg-red-50 text-red-700 text-xs font-semibold px-3 py-2">Missing — 파일 없음 ({scan.missing.length}건)</div>
                        <div className="max-h-56 overflow-y-auto divide-y">
                          {scan.missing.map((m, i) => (
                            <div key={i} className="px-3 py-2 text-xs">
                              <span className="font-medium">{m.originalFileName}</span>
                              <span className="text-muted-foreground"> · {m.kind}</span>
                              <p className="text-muted-foreground font-mono truncate">{m.storedPath}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {scan.orphans.length > 0 && (
                      <div className="border border-amber-200 rounded-xl overflow-hidden">
                        <div className="bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-2">Orphan — DB에 연결 안 됨 ({scan.orphans.length}건)</div>
                        <div className="max-h-56 overflow-y-auto divide-y">
                          {scan.orphans.map((p, i) => <div key={i} className="px-3 py-2 text-xs font-mono truncate">{p}</div>)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── 정책 설정 ── */}
          <section className="space-y-4 pb-8">
            <h2 className="font-semibold text-base">정책 설정</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">최대 업로드 용량(MB)</label>
                <input type="number" min={1} value={settings.maxUploadSizeMb}
                  onChange={e => setSettings(s => s && { ...s, maxUploadSizeMb: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">한 번에 업로드 최대 파일수</label>
                <input type="number" min={1} value={settings.maxFilesPerBatch}
                  onChange={e => setSettings(s => s && { ...s, maxFilesPerBatch: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">허용 확장자(쉼표로 구분)</label>
              <input value={settings.allowedExtensions.join(', ')}
                onChange={e => setSettings(s => s && { ...s, allowedExtensions: e.target.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">중복 업로드 정책</label>
              <select value={settings.duplicatePolicy} onChange={e => setSettings(s => s && { ...s, duplicatePolicy: e.target.value as PhotoSettings['duplicatePolicy'] })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="ask">물어보기</option>
                <option value="reuse">기존 사진 재사용</option>
                <option value="always_new">항상 새로 업로드</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">휴지통 보관 기간(일)</label>
              <input type="number" min={1} value={settings.trashRetentionDays}
                onChange={e => setSettings(s => s && { ...s, trashRetentionDays: Number(e.target.value) })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              <p className="text-xs text-muted-foreground mt-1">이 기간이 지나면 휴지통의 사진이 자동으로 영구삭제됩니다.</p>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold">외부 공유</h3>
              <label className="flex items-center justify-between text-sm">
                <span>외부 공유 허용</span>
                <button type="button" onClick={() => setSettings(s => s && { ...s, allowExternalShare: !s.allowExternalShare })}
                  className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', settings.allowExternalShare ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', settings.allowExternalShare && 'translate-x-5')} />
                </button>
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>비밀번호 없는 공유 허용</span>
                <button type="button" onClick={() => setSettings(s => s && { ...s, allowPasswordlessExternalShare: !s.allowPasswordlessExternalShare })}
                  className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', settings.allowPasswordlessExternalShare ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', settings.allowPasswordlessExternalShare && 'translate-x-5')} />
                </button>
              </label>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">최대 허용 기간(일)</label>
                <input type="number" min={1} value={settings.maxExternalShareDays}
                  onChange={e => setSettings(s => s && { ...s, maxExternalShareDays: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <label className="flex items-center justify-between text-sm">
                <span>원본 다운로드 기본값</span>
                <button type="button" onClick={() => setSettings(s => s && { ...s, defaultAllowOriginalDownload: !s.defaultAllowOriginalDownload })}
                  className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', settings.defaultAllowOriginalDownload ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', settings.defaultAllowOriginalDownload && 'translate-x-5')} />
                </button>
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>워터마크 기본값</span>
                <button type="button" onClick={() => setSettings(s => s && { ...s, defaultWatermark: !s.defaultWatermark })}
                  className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', settings.defaultWatermark ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', settings.defaultWatermark && 'translate-x-5')} />
                </button>
              </label>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold">기타</h3>
              <label className="flex items-center justify-between text-sm">
                <span>GPS 위치정보 노출</span>
                <button type="button" onClick={() => setSettings(s => s && { ...s, showExifGps: !s.showExifGps })}
                  className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', settings.showExifGps ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', settings.showExifGps && 'translate-x-5')} />
                </button>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">썸네일(소) px</label>
                  <input type="number" min={40} value={settings.thumbSmallPx} onChange={e => setSettings(s => s && { ...s, thumbSmallPx: Number(e.target.value) })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">썸네일(중) px</label>
                  <input type="number" min={80} value={settings.thumbMediumPx} onChange={e => setSettings(s => s && { ...s, thumbMediumPx: Number(e.target.value) })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">미리보기(대) px</label>
                  <input type="number" min={400} value={settings.previewLargePx} onChange={e => setSettings(s => s && { ...s, previewLargePx: Number(e.target.value) })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">파생본 크기 변경은 이후 새로 업로드/재생성되는 사진부터 적용됩니다(기존 파생본은 자동으로 다시 만들어지지 않습니다).</p>
            </div>

            <button onClick={save} disabled={saving}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}저장
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
