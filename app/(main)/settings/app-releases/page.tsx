'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import {
  Rocket, Smartphone, Monitor, Apple, Compass, UploadCloud,
  Loader2, CheckCircle2, XCircle, Copy, Check, Trash2, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Tab = 'pwa' | 'windows' | 'macos' | 'guide' | 'releases';

interface Release {
  id: string; platform: string; architecture: string; version: string; build_number: string | null;
  file_name: string; file_path: string; file_size: number; sha256: string;
  release_notes: string | null; minimum_os: string | null; active: number;
  created_by: string; created_at: string;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CopyableHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      title={value}
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {value.slice(0, 12)}...
    </button>
  );
}

function ReleaseRow({ r, onToggle, onDelete }: { r: Release; onToggle: (r: Release) => void; onDelete: (r: Release) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/60 last:border-0 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground bg-muted rounded px-1.5 py-0.5">{r.platform}</span>
          <span className="font-medium">v{r.version}</span>
          <span className="text-xs text-muted-foreground">{r.architecture}</span>
          {r.active ? (
            <span className="text-[10px] font-semibold bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">활성</span>
          ) : (
            <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">비활성</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{r.file_name} · {fmtBytes(r.file_size)} · {fmtDate(r.created_at)}</p>
        <CopyableHash value={r.sha256} />
      </div>
      <button
        type="button"
        onClick={() => onToggle(r)}
        className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', r.active ? 'bg-primary' : 'bg-muted')}
        title={r.active ? '비활성화' : '활성화'}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', r.active === 1 && 'translate-x-5')} />
      </button>
      <button type="button" onClick={() => onDelete(r)} className="text-muted-foreground hover:text-red-600 shrink-0" title="삭제">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AppReleasesPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [tab, setTab] = useState<Tab>('pwa');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showMsg = (type: 'success' | 'error', text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);

  const [pwaStatus, setPwaStatus] = useState<{ manifest: 'ok' | 'fail' | null; sw: 'ok' | 'fail' | null; manifestData: Record<string, unknown> | null }>({ manifest: null, sw: null, manifestData: null });

  const [uploadForm, setUploadForm] = useState({ platform: 'windows', architecture: '', version: '', buildNumber: '', releaseNotes: '', minimumOs: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user ?? null));
  }, []);

  const loadReleases = useCallback(async () => {
    setLoadingReleases(true);
    try {
      const res = await fetch('/api/settings/app-releases');
      const j = await res.json();
      setReleases(j.data ?? []);
    } finally {
      setLoadingReleases(false);
    }
  }, []);

  const loadPwaStatus = useCallback(async () => {
    const [manifestRes, swRes] = await Promise.all([
      fetch('/manifest.webmanifest').then(r => ({ ok: r.ok, r })).catch(() => ({ ok: false, r: null })),
      fetch('/sw.js').then(r => r.ok).catch(() => false),
    ]);
    let manifestData: Record<string, unknown> | null = null;
    if (manifestRes.ok && manifestRes.r) {
      try { manifestData = await manifestRes.r.json(); } catch { /* ignore */ }
    }
    setPwaStatus({ manifest: manifestRes.ok ? 'ok' : 'fail', sw: swRes ? 'ok' : 'fail', manifestData });
  }, []);

  useEffect(() => {
    if (tab === 'windows' || tab === 'macos' || tab === 'releases') loadReleases();
    if (tab === 'pwa') loadPwaStatus();
  }, [tab, loadReleases, loadPwaStatus]);

  const toggleActive = async (r: Release) => {
    const res = await fetch(`/api/settings/app-releases/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !r.active }),
    });
    if (res.ok) { showMsg('success', r.active ? '비활성화했습니다.' : '활성화했습니다.'); loadReleases(); }
    else showMsg('error', '실패했습니다.');
  };

  const deleteRelease = async (r: Release) => {
    if (!confirm(`v${r.version} (${r.architecture}) 릴리스를 삭제할까요?\n파일도 함께 삭제됩니다.`)) return;
    const res = await fetch(`/api/settings/app-releases/${r.id}`, { method: 'DELETE' });
    if (res.ok) { showMsg('success', '삭제했습니다.'); loadReleases(); }
    else showMsg('error', '실패했습니다.');
  };

  const upload = async () => {
    if (!uploadFile) return showMsg('error', '파일을 선택하세요.');
    if (!uploadForm.architecture.trim() || !uploadForm.version.trim()) return showMsg('error', 'architecture와 version은 필수입니다.');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('platform', uploadForm.platform);
      fd.append('architecture', uploadForm.architecture.trim());
      fd.append('version', uploadForm.version.trim());
      if (uploadForm.buildNumber.trim()) fd.append('buildNumber', uploadForm.buildNumber.trim());
      if (uploadForm.releaseNotes.trim()) fd.append('releaseNotes', uploadForm.releaseNotes.trim());
      if (uploadForm.minimumOs.trim()) fd.append('minimumOs', uploadForm.minimumOs.trim());
      const res = await fetch('/api/settings/app-releases', { method: 'POST', body: fd });
      if (res.ok) {
        showMsg('success', '릴리스를 업로드했습니다.');
        setUploadFile(null);
        setUploadForm(f => ({ ...f, architecture: '', version: '', buildNumber: '', releaseNotes: '', minimumOs: '' }));
        loadReleases();
      } else {
        const j = await res.json().catch(() => ({}));
        showMsg('error', j.error || '업로드에 실패했습니다.');
      }
    } finally {
      setUploading(false);
    }
  };

  if (!me) return null;
  if (me.role !== 'admin') return <div className="p-8 text-sm text-muted-foreground">관리자만 접근할 수 있습니다.</div>;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'pwa', label: '모바일 PWA', icon: <Smartphone className="w-4 h-4" /> },
    { id: 'windows', label: 'Windows', icon: <Monitor className="w-4 h-4" /> },
    { id: 'macos', label: 'macOS', icon: <Apple className="w-4 h-4" /> },
    { id: 'guide', label: '설치안내', icon: <Compass className="w-4 h-4" /> },
    { id: 'releases', label: 'Release 관리', icon: <UploadCloud className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="앱 및 설치" icon={<Rocket className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto">
        <div className="border-b border-border px-4 lg:px-6 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 whitespace-nowrap',
                tab === t.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {msg && (
          <div className={cn('mx-4 lg:mx-6 mt-3 px-4 py-2 rounded-lg text-sm', msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
            {msg.text}
          </div>
        )}

        <div className="p-4 lg:p-6 max-w-3xl space-y-5">
          {tab === 'pwa' && (
            <div className="space-y-4">
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-xs text-amber-800">
                여기서 확인 가능한 건 서버가 정적 파일을 정상적으로 서빙하고 있는지까지입니다.
                사용자 기기에 실제로 PWA가 설치됐는지, 서비스워커가 등록·활성화됐는지는 서버에서 알 수 없고
                각 사용자의 브라우저 개발자도구(Application 탭)에서만 확인할 수 있습니다.
              </div>
              <div className="border border-border rounded-xl divide-y divide-border">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">manifest.webmanifest</span>
                  {pwaStatus.manifest === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> :
                    pwaStatus.manifest === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">sw.js (서비스워커)</span>
                  {pwaStatus.sw === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> :
                    pwaStatus.sw === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                {pwaStatus.manifestData && (
                  <div className="px-4 py-3 text-xs text-muted-foreground space-y-1">
                    <p>name: {String(pwaStatus.manifestData.name ?? '-')}</p>
                    <p>display: {String(pwaStatus.manifestData.display ?? '-')}</p>
                    <p>theme_color: {String(pwaStatus.manifestData.theme_color ?? '-')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(tab === 'windows' || tab === 'macos') && (
            <div className="border border-border rounded-xl">
              {loadingReleases ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                (() => {
                  const filtered = releases.filter(r => r.platform === tab);
                  if (!filtered.length) return <p className="text-sm text-muted-foreground text-center py-8">등록된 릴리스가 없습니다. &quot;Release 관리&quot; 탭에서 업로드하세요.</p>;
                  return filtered.map(r => <ReleaseRow key={r.id} r={r} onToggle={toggleActive} onDelete={deleteRelease} />);
                })()
              )}
            </div>
          )}

          {tab === 'guide' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">사용자에게 보이는 설치 안내 화면 미리보기입니다. 실제 화면과 동일합니다.</p>
              {[
                { href: '/install', label: '설치센터 (자동 OS 감지)' },
                { href: '/install/android', label: 'Android 설치 안내' },
                { href: '/install/ios', label: 'iPhone/iPad 설치 안내' },
                { href: '/install/windows', label: 'Windows 설치 안내' },
                { href: '/install/macos', label: 'macOS 설치 안내' },
              ].map(g => (
                <Link key={g.href} href={g.href} target="_blank" className="flex items-center justify-between border border-border rounded-xl px-4 py-3 text-sm hover:bg-muted transition-colors">
                  {g.label}
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}

          {tab === 'releases' && (
            <div className="space-y-5">
              <div className="border border-border rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold">새 릴리스 업로드</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">플랫폼</label>
                    <select
                      value={uploadForm.platform}
                      onChange={e => setUploadForm(f => ({ ...f, platform: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="windows">Windows</option>
                      <option value="macos">macOS</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">아키텍처 *</label>
                    <Input className="h-9" placeholder="x64 / arm64 / universal" value={uploadForm.architecture}
                      onChange={e => setUploadForm(f => ({ ...f, architecture: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">버전 *</label>
                    <Input className="h-9" placeholder="0.1.0" value={uploadForm.version}
                      onChange={e => setUploadForm(f => ({ ...f, version: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">빌드 번호 (선택)</label>
                    <Input className="h-9" value={uploadForm.buildNumber}
                      onChange={e => setUploadForm(f => ({ ...f, buildNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">최소 OS (선택)</label>
                    <Input className="h-9" placeholder="Windows 10 이상" value={uploadForm.minimumOs}
                      onChange={e => setUploadForm(f => ({ ...f, minimumOs: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">설치파일</label>
                    <input type="file" accept=".msi,.exe,.dmg" className="text-xs"
                      onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">릴리스 노트 (선택 — 서명 상태 등 사용자 안내)</label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[70px]"
                    value={uploadForm.releaseNotes}
                    onChange={e => setUploadForm(f => ({ ...f, releaseNotes: e.target.value }))}
                  />
                </div>
                <Button type="button" onClick={upload} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  업로드
                </Button>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">전체 릴리스</p>
                <div className="border border-border rounded-xl">
                  {loadingReleases ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : releases.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">등록된 릴리스가 없습니다.</p>
                  ) : (
                    releases.map(r => <ReleaseRow key={r.id} r={r} onToggle={toggleActive} onDelete={deleteRelease} />)
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
