'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, HardDrive, RefreshCw,
  KeyRound, Download, FlaskConical, FileText, History, Globe, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'status' | 'schedule' | 'packages' | 'restore' | 'test' | 'docs' | 'changelog' | 'external';

interface CoverageItem { key: string; label: string; status: 'Protected' | 'Partial' | 'Unprotected'; detail: string }
interface DrReadiness {
  items: CoverageItem[]; fullyProtected: boolean; readinessPercent: number; gaps: string[];
  lastFullBackup: { createdAt: string; status: string } | null;
  lastRestoreTest: { createdAt: string; status: string } | null;
}
interface ExternalDep { name: string; requiredForRestore: boolean; localBackupAvailable: boolean; credentialAvailable: boolean; canRecreateAutomatically: boolean }
interface PackageItem { id: string; filename: string; sizeBytes: number; triggeredBy: string; status: string; encrypted: boolean; error: string | null; createdAt: string; existsOnDisk: boolean }
interface DriveInfo { device: string; mountPoint: string; fsType: string; uuid: string | null; sizeBytes: number | null; freeBytes: number | null }
interface ScheduleConfig {
  enabled: boolean; completePackageEnabled: boolean; scheduleDayInterval: number; scheduleHour: number; scheduleMinute: number;
  completePackageRetainCount: number; completePackageMonthlyArchiveCount: number;
}
interface ChangeEntry { id: string; occurredAt: string; category: string; summary: string; details: string | null; createdBy: string | null }
interface RestoreTestItem { id: string; packageId: string; status: string; error: string | null; createdAt: string }

const STATUS_COLOR: Record<CoverageItem['status'], string> = {
  Protected: 'text-green-700 bg-green-50 border-green-200',
  Partial: 'text-amber-700 bg-amber-50 border-amber-200',
  Unprotected: 'text-red-700 bg-red-50 border-red-200',
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

export default function DisasterRecoveryPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [tab, setTab] = useState<Tab>('status');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showMsg = (type: 'success' | 'error', text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000); };

  const [readiness, setReadiness] = useState<DrReadiness | null>(null);
  const [externalDeps, setExternalDeps] = useState<ExternalDep[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [drives, setDrives] = useState<{ detected: DriveInfo[]; selectedUuid: string | null; selectedMountPoint: string | null } | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [hasRecoveryPw, setHasRecoveryPw] = useState<boolean | null>(null);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [restoreTests, setRestoreTests] = useState<RestoreTestItem[]>([]);
  const [docsPreview, setDocsPreview] = useState<Record<string, string> | null>(null);
  const [activeDoc, setActiveDoc] = useState<string>('SYSTEM_ARCHITECTURE.md');

  const [busy, setBusy] = useState<string | null>(null);
  const [pwForm, setPwForm] = useState('');
  const [recoverySheet, setRecoverySheet] = useState<string | null>(null);
  const [serverSaveInfo, setServerSaveInfo] = useState<{ savedPath: string; location: string; note: string } | null>(null);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user ?? null)); }, []);

  const loadCoverage = useCallback(() => {
    fetch('/api/settings/backup/coverage').then(r => r.json()).then(j => {
      if (j.data) { setReadiness(j.data.readiness); setExternalDeps(j.data.externalDependencies); }
    });
  }, []);
  const loadPackages = useCallback(() => {
    fetch('/api/settings/backup/complete').then(r => r.json()).then(j => { if (Array.isArray(j.data)) setPackages(j.data); });
  }, []);
  const loadDrives = useCallback(() => {
    fetch('/api/settings/backup/drives').then(r => r.json()).then(j => { if (j.data) setDrives(j.data); });
  }, []);
  const loadSchedule = useCallback(() => {
    fetch('/api/settings/backup').then(r => r.json()).then(j => { if (j.data) setSchedule(j.data); });
  }, []);
  const loadRecoveryPwStatus = useCallback(() => {
    fetch('/api/settings/backup/recovery-password').then(r => r.json()).then(j => { if (j.data) setHasRecoveryPw(j.data.configured); });
  }, []);
  const loadChanges = useCallback(() => {
    fetch('/api/settings/backup/change-log').then(r => r.json()).then(j => { if (Array.isArray(j.data)) setChanges(j.data); });
  }, []);
  const loadRestoreTests = useCallback(() => {
    fetch('/api/settings/backup/restore-test').then(r => r.json()).then(j => { if (Array.isArray(j.data)) setRestoreTests(j.data); });
  }, []);
  const loadDocsPreview = useCallback(() => {
    fetch('/api/settings/backup/docs-preview').then(r => r.json()).then(j => { if (j.data) setDocsPreview(j.data.docs); });
  }, []);

  useEffect(() => {
    if (!me || me.role !== 'admin') return;
    if (tab === 'status') { loadCoverage(); loadSchedule(); loadRecoveryPwStatus(); }
    if (tab === 'schedule') { loadSchedule(); loadDrives(); loadRecoveryPwStatus(); }
    if (tab === 'packages') loadPackages();
    if (tab === 'restore') { loadPackages(); loadRecoveryPwStatus(); }
    if (tab === 'test') { loadPackages(); loadRestoreTests(); }
    if (tab === 'docs') loadDocsPreview();
    if (tab === 'changelog') loadChanges();
    if (tab === 'external') loadCoverage();
  }, [tab, me, loadCoverage, loadPackages, loadDrives, loadSchedule, loadRecoveryPwStatus, loadChanges, loadRestoreTests, loadDocsPreview]);

  const saveSchedule = async (patch: Partial<ScheduleConfig>) => {
    const res = await fetch('/api/settings/backup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const j = await res.json();
    if (res.ok) { setSchedule(j.data); showMsg('success', '설정이 저장됐습니다.'); }
    else showMsg('error', j.error ?? '저장 실패');
  };

  const setRecoveryPassword = async () => {
    if (pwForm.length < 8) { showMsg('error', 'Recovery Password는 최소 8자 이상이어야 합니다.'); return; }
    setBusy('recovery-password');
    try {
      const res = await fetch('/api/settings/backup/recovery-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwForm }) });
      const j = await res.json();
      if (res.ok) {
        setRecoverySheet(j.data.recoverySheet);
        setServerSaveInfo(j.data.serverSave ?? null);
        setHasRecoveryPw(true); setPwForm('');
        showMsg('success', 'Recovery Password가 설정됐습니다. 서버에도 자동 저장했지만, 다운로드한 사본을 반드시 NAS 밖 별도 장소에도 보관하세요.');
      }
      else showMsg('error', j.error ?? '실패');
    } finally { setBusy(null); }
  };

  const downloadRecoverySheet = () => {
    if (!recoverySheet) return;
    const blob = new Blob([recoverySheet], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'YNK-RECOVERY-KEY.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const runCompleteBackup = async () => {
    if (!confirm('지금 바로 Complete Recovery Package를 생성할까요? DB/첨부파일/Qdrant/시크릿을 읽어 압축하므로 시간이 걸릴 수 있습니다.')) return;
    setBusy('complete-backup');
    try {
      const res = await fetch('/api/settings/backup/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await res.json();
      if (res.ok) { showMsg('success', `백업 완료 (${j.data.status})${j.data.warnings?.length ? ' — 경고 ' + j.data.warnings.length + '건' : ''}`); loadPackages(); loadCoverage(); }
      else showMsg('error', j.error ?? '백업 실패');
    } finally { setBusy(null); }
  };

  const runDryRun = async (filename: string) => {
    setBusy('dry-run-' + filename);
    try {
      const res = await fetch('/api/settings/backup/dry-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
      const j = await res.json();
      if (res.ok) setDryRunResult(j.data);
      else showMsg('error', j.error ?? '검사 실패');
    } finally { setBusy(null); }
  };

  const runRestoreTest = async (filename: string) => {
    setBusy('restore-test-' + filename);
    try {
      const res = await fetch('/api/settings/backup/restore-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
      const j = await res.json();
      if (res.ok) { showMsg(j.data.status === 'SUCCESS' ? 'success' : 'error', `복구 테스트 ${j.data.status}`); loadRestoreTests(); }
      else showMsg('error', j.error ?? '복구 테스트 실패');
    } finally { setBusy(null); }
  };

  const selectDrive = async (uuid: string) => {
    const res = await fetch('/api/settings/backup/drives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid }) });
    const j = await res.json();
    if (res.ok) { loadDrives(); showMsg('success', '백업 드라이브가 선택됐습니다.'); }
    else showMsg('error', j.error ?? '실패');
  };

  if (!me) return null;
  if (me.role !== 'admin') return <div className="p-8 text-sm text-muted-foreground">관리자만 접근할 수 있습니다.</div>;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '상태', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'schedule', label: '자동백업', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'packages', label: '백업목록', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'restore', label: '복구', icon: <Download className="w-4 h-4" /> },
    { id: 'test', label: '복구테스트', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'docs', label: '시스템구조', icon: <FileText className="w-4 h-4" /> },
    { id: 'changelog', label: '변경이력', icon: <History className="w-4 h-4" /> },
    { id: 'external', label: '외부의존성', icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="재해복구(Disaster Recovery)" icon={<ShieldCheck className="w-5 h-5" />} />
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

        <div className="p-4 lg:p-6 max-w-4xl space-y-5">
          {tab === 'status' && readiness && (
            <div className="space-y-4">
              <div className={cn('rounded-xl p-5 border', readiness.fullyProtected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200')}>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  {readiness.fullyProtected ? <ShieldCheck className="w-6 h-6 text-green-600" /> : <ShieldAlert className="w-6 h-6 text-amber-600" />}
                  {readiness.fullyProtected ? 'FULLY PROTECTED' : `DR Readiness ${readiness.readinessPercent}%`}
                </div>
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <div>최근 Full Backup: {readiness.lastFullBackup ? `${readiness.lastFullBackup.createdAt} (${readiness.lastFullBackup.status})` : '없음'}</div>
                  <div>최근 복구 테스트: {readiness.lastRestoreTest ? `${readiness.lastRestoreTest.createdAt} (${readiness.lastRestoreTest.status})` : '없음'}</div>
                  <div>Recovery Password: {hasRecoveryPw ? '설정됨' : '미설정'}</div>
                  <div>자동 백업: {schedule?.completePackageEnabled ? `켜짐(${schedule.scheduleDayInterval}일마다 ${String(schedule.scheduleHour).padStart(2, '0')}:${String(schedule.scheduleMinute).padStart(2, '0')})` : '꺼짐'}</div>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border font-medium text-sm">Backup Coverage</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {readiness.items.map(item => (
                      <tr key={item.key}>
                        <td className="px-4 py-2 font-medium whitespace-nowrap">{item.label}</td>
                        <td className="px-4 py-2"><span className={cn('text-xs px-2 py-0.5 rounded-full border', STATUS_COLOR[item.status])}>{item.status}</span></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {readiness.gaps.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800"><AlertTriangle className="w-4 h-4" />해결 필요 항목</div>
                  {readiness.gaps.map((g, i) => <div key={i} className="text-xs text-amber-700">- {g}</div>)}
                </div>
              )}

              <Button onClick={runCompleteBackup} disabled={busy === 'complete-backup'} className="gap-1.5">
                {busy === 'complete-backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                지금 전체 백업(Complete Recovery Package)
              </Button>
            </div>
          )}

          {tab === 'schedule' && schedule && (
            <div className="space-y-5">
              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="font-medium text-sm flex items-center gap-1.5"><KeyRound className="w-4 h-4" />Recovery Password</div>
                <p className="text-xs text-muted-foreground">백업 안의 API 토큰/비밀번호(secrets.enc)를 암호화하는 비밀번호입니다. 이 비밀번호는 서버에 평문으로 저장되지 않습니다 — 잊어버리면 시크릿 부분만 복구할 수 없게 됩니다(DB/첨부파일/애플리케이션은 이 비밀번호 없이도 복원 가능).</p>
                <div className="text-xs">현재 상태: {hasRecoveryPw === null ? '확인 중...' : hasRecoveryPw ? <span className="text-green-700 font-medium">설정됨</span> : <span className="text-red-600 font-medium">미설정</span>}</div>
                <div className="flex gap-2">
                  <Input type="password" placeholder={hasRecoveryPw ? '변경하려면 새 비밀번호 입력(8자 이상)' : '새 Recovery Password(8자 이상)'} value={pwForm} onChange={e => setPwForm(e.target.value)} className="h-9 max-w-xs" />
                  <Button size="sm" onClick={setRecoveryPassword} disabled={busy === 'recovery-password'}>{busy === 'recovery-password' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '설정'}</Button>
                </div>
                {recoverySheet && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-blue-800">이 브라우저(PC)로도 다운로드해서 <b>NAS 밖 별도 장소</b>에 보관하세요.</p>
                    <Button size="sm" variant="outline" onClick={downloadRecoverySheet} className="gap-1.5"><Download className="w-3.5 h-3.5" />YNK-RECOVERY-KEY.txt 다운로드</Button>
                    {serverSaveInfo && (
                      serverSaveInfo.location === 'failed' ? (
                        <p className="text-xs text-red-700">서버 저장 실패: {serverSaveInfo.note}</p>
                      ) : (
                        <p className="text-xs text-blue-700">서버에도 자동 저장됨: <code className="bg-blue-100 px-1 rounded">{serverSaveInfo.savedPath}</code><br />{serverSaveInfo.note}</p>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Complete Recovery Package 자동 백업</div>
                  <button onClick={() => saveSchedule({ completePackageEnabled: !schedule.completePackageEnabled })}
                    className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', schedule.completePackageEnabled ? 'bg-primary' : 'bg-muted')}>
                    <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', schedule.completePackageEnabled && 'translate-x-5')} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">주기(일)</label>
                    <Input type="number" min={1} defaultValue={schedule.scheduleDayInterval} onBlur={e => saveSchedule({ scheduleDayInterval: Number(e.target.value) || 3 })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">시(0-23)</label>
                    <Input type="number" min={0} max={23} defaultValue={schedule.scheduleHour} onBlur={e => saveSchedule({ scheduleHour: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">분(0-59)</label>
                    <Input type="number" min={0} max={59} defaultValue={schedule.scheduleMinute} onBlur={e => saveSchedule({ scheduleMinute: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">최근 보존 개수</label>
                    <Input type="number" min={1} defaultValue={schedule.completePackageRetainCount} onBlur={e => saveSchedule({ completePackageRetainCount: Number(e.target.value) || 5 })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">월간 아카이브 개수</label>
                    <Input type="number" min={0} defaultValue={schedule.completePackageMonthlyArchiveCount} onBlur={e => saveSchedule({ completePackageMonthlyArchiveCount: Number(e.target.value) || 3 })} className="h-9" />
                  </div>
                </div>
              </div>

              <div className="border border-border rounded-xl p-4 space-y-2">
                <div className="font-medium text-sm">백업 드라이브(외장 HDD)</div>
                {drives && drives.detected.length === 0 && (
                  <p className="text-xs text-muted-foreground">감지된 외장 USB 드라이브가 없습니다(Synology NAS가 아니거나 드라이브가 연결되지 않음). 연결 후 새로고침하세요.</p>
                )}
                {drives?.detected.map(d => (
                  <div key={d.uuid || d.mountPoint} className={cn('flex items-center justify-between border rounded-lg px-3 py-2 text-xs', drives.selectedUuid === d.uuid ? 'border-primary bg-primary/5' : 'border-border')}>
                    <div>
                      <div className="font-medium">{d.mountPoint}</div>
                      <div className="text-muted-foreground">{d.fsType} · {d.freeBytes != null ? `여유 ${fmtBytes(d.freeBytes)}` : ''} {d.sizeBytes != null ? `/ 전체 ${fmtBytes(d.sizeBytes)}` : ''}</div>
                    </div>
                    <Button size="sm" variant={drives.selectedUuid === d.uuid ? 'default' : 'outline'} disabled={!d.uuid} onClick={() => d.uuid && selectDrive(d.uuid)}>
                      {drives.selectedUuid === d.uuid ? '선택됨' : '선택'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'packages' && (
            <div className="space-y-2">
              <Button onClick={runCompleteBackup} disabled={busy === 'complete-backup'} size="sm" className="gap-1.5 mb-2">
                {busy === 'complete-backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}지금 전체 백업
              </Button>
              {packages.length === 0 && <p className="text-sm text-muted-foreground">아직 생성된 Complete Recovery Package가 없습니다.</p>}
              {packages.map(p => (
                <div key={p.id} className="border border-border rounded-lg p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{p.filename}</div>
                    <div className="text-xs text-muted-foreground">{p.createdAt} · {fmtBytes(p.sizeBytes)} · {p.triggeredBy} · {p.encrypted ? '암호화됨' : '암호화 안 됨'} {!p.existsOnDisk && <span className="text-red-600">(파일 없음)</span>}</div>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border', p.status === 'SUCCESS' ? 'bg-green-50 text-green-700 border-green-200' : p.status === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200')}>{p.status}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'restore' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">이 화면에서는 <b>운영 중인 서버를 직접 복원하지 않습니다</b>(위험한 작업이라 별도 스크립트로 분리했습니다). 새 NAS에서 <code className="bg-muted px-1 rounded">recovery/preflight.sh</code> → <code className="bg-muted px-1 rounded">restore.sh</code> → <code className="bg-muted px-1 rounded">verify.sh</code>를 순서대로 실행하세요. 여기서는 백업 파일이 실제로 복구 가능한 상태인지만 미리 점검할 수 있습니다.</p>
              <div className="space-y-2">
                {packages.map(p => (
                  <div key={p.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{p.filename}</div>
                      <Button size="sm" variant="outline" onClick={() => runDryRun(p.filename)} disabled={busy === 'dry-run-' + p.filename}>
                        {busy === 'dry-run-' + p.filename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '복구 가능성 검사'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {dryRunResult && (
                <div className="border border-border rounded-xl p-4 space-y-2">
                  <div className="font-medium text-sm">{String(dryRunResult.filename)} — {(dryRunResult.overallOk as boolean) ? <span className="text-green-700">복구 가능</span> : <span className="text-red-600">복구 불가(필수 항목 누락)</span>}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(dryRunResult.checks as { key: string; label: string; ok: boolean }[]).map(c => (
                      <div key={c.key} className="flex items-center gap-1.5 text-xs">
                        {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}{c.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'test' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">별도 임시 디렉터리에 실제로 압축을 풀어 DB 무결성과 첨부파일 체크섬을 검증합니다(운영 데이터에는 영향 없음).</p>
              <div className="space-y-2">
                {packages.map(p => (
                  <div key={p.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                    <div className="text-sm">{p.filename}</div>
                    <Button size="sm" variant="outline" onClick={() => runRestoreTest(p.filename)} disabled={busy === 'restore-test-' + p.filename} className="gap-1.5">
                      {busy === 'restore-test-' + p.filename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}복구 테스트 실행
                    </Button>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4">
                <div className="font-medium text-sm mb-2">이력</div>
                {restoreTests.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs border-b border-border py-1.5 last:border-0">
                    <span>{t.createdAt} — {t.packageId}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full', t.status === 'SUCCESS' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'docs' && docsPreview && (
            <div className="flex gap-4">
              <div className="w-56 shrink-0 space-y-1">
                {Object.keys(docsPreview).map(name => (
                  <button key={name} onClick={() => setActiveDoc(name)}
                    className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded-md', activeDoc === name ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                    {name}
                  </button>
                ))}
              </div>
              <pre className="flex-1 text-xs bg-muted/30 border border-border rounded-lg p-4 overflow-auto whitespace-pre-wrap">{docsPreview[activeDoc]}</pre>
            </div>
          )}

          {tab === 'changelog' && (
            <div className="space-y-2">
              {changes.map(c => (
                <div key={c.id} className="border-b border-border py-2 text-sm">
                  <span className="text-xs text-muted-foreground">{c.occurredAt.slice(0, 10)}</span>{' '}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{c.category}</span>{' '}
                  {c.summary}
                  {c.details && <div className="text-xs text-muted-foreground mt-0.5">{c.details}</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'external' && (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">서비스</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">복구 시 필요?</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">로컬 백업</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Credential</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">자동 재생성?</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {externalDeps.map(d => (
                    <tr key={d.name}>
                      <td className="px-3 py-2 font-medium">{d.name}</td>
                      <td className="px-3 py-2">{d.requiredForRestore ? 'YES' : 'NO'}</td>
                      <td className="px-3 py-2">{d.localBackupAvailable ? 'YES' : 'NO'}</td>
                      <td className="px-3 py-2">{d.credentialAvailable ? '설정됨' : '없음'}</td>
                      <td className="px-3 py-2">{d.canRecreateAutomatically ? 'YES' : 'NO(수동)'}</td>
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
