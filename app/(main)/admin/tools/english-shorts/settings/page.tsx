'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Settings, HeartPulse, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface HealthItem { name: string; status: 'ok' | 'warning' | 'error'; detail: string }
interface Health { overallStatus: 'ok' | 'warning' | 'error'; checkedAt: string; items: HealthItem[] }
interface EsSettings {
  maxUploadSizeMb: number; allowedExtensions: string[]; maxClipsPerProject: number; maxRenderConcurrency: number;
  renderStaleProcessingMinutes: number; renderMaxAttempts: number; outputFps: number;
  outputVideoBitrateK: number; outputAudioBitrateK: number; ffmpegContainer: string; getyarnSearchBaseUrl: string;
}

const STATUS_ICON: Record<HealthItem['status'], typeof CheckCircle2> = {
  ok: CheckCircle2, warning: AlertTriangle, error: XCircle,
};
const STATUS_COLOR: Record<HealthItem['status'], string> = {
  ok: 'text-green-600', warning: 'text-amber-600', error: 'text-red-600',
};

export default function EnglishShortsSettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<EsSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadHealth = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch('/api/admin-tools/english-shorts/health');
      const j = await res.json();
      setHealth(j);
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/admin-tools/english-shorts/settings');
    const j = await res.json();
    if (j.settings) setSettings(j.settings);
  }, []);

  useEffect(() => { loadHealth(); loadSettings(); }, [loadHealth, loadSettings]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin-tools/english-shorts/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      const j = await res.json();
      if (j.settings) {
        setSettings(j.settings);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="English Shorts 설정" icon={<Settings className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Settings className="w-4 h-4 text-primary" />도구 설정</h2>
          {settings ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">최대 업로드 크기(MB)</label>
                <input type="number" min={1} value={settings.maxUploadSizeMb}
                  onChange={e => setSettings(s => s && { ...s, maxUploadSizeMb: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">프로젝트당 최대 클립 수</label>
                <input type="number" min={1} value={settings.maxClipsPerProject}
                  onChange={e => setSettings(s => s && { ...s, maxClipsPerProject: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">동시 렌더 제한</label>
                <input type="number" min={1} value={settings.maxRenderConcurrency}
                  onChange={e => setSettings(s => s && { ...s, maxRenderConcurrency: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">최대 재시도 횟수</label>
                <input type="number" min={1} value={settings.renderMaxAttempts}
                  onChange={e => setSettings(s => s && { ...s, renderMaxAttempts: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Stale 처리 회수 기준(분)</label>
                <input type="number" min={1} value={settings.renderStaleProcessingMinutes}
                  onChange={e => setSettings(s => s && { ...s, renderStaleProcessingMinutes: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">출력 FPS</label>
                <input type="number" min={1} value={settings.outputFps}
                  onChange={e => setSettings(s => s && { ...s, outputFps: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">비디오 비트레이트(kbps)</label>
                <input type="number" min={1} value={settings.outputVideoBitrateK}
                  onChange={e => setSettings(s => s && { ...s, outputVideoBitrateK: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">오디오 비트레이트(kbps)</label>
                <input type="number" min={1} value={settings.outputAudioBitrateK}
                  onChange={e => setSettings(s => s && { ...s, outputAudioBitrateK: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">FFmpeg 컨테이너 이름</label>
                <input value={settings.ffmpegContainer}
                  onChange={e => setSettings(s => s && { ...s, ffmpegContainer: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">허용 확장자(쉼표로 구분)</label>
                <input value={settings.allowedExtensions.join(', ')}
                  onChange={e => setSettings(s => s && { ...s, allowedExtensions: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <button onClick={saveSettings} disabled={savingSettings}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savedFlash ? '저장됨' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><HeartPulse className="w-4 h-4 text-primary" />System Health</h2>
            <button onClick={() => loadHealth(true)} disabled={refreshing}
              className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5 disabled:opacity-50">
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}새로고침
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : health ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                마지막 확인: {new Date(health.checkedAt).toLocaleString('ko-KR')}
              </p>
              {health.items.map(item => {
                const Icon = STATUS_ICON[item.status];
                return (
                  <div key={item.name} className="flex items-start gap-2 p-2.5 rounded-lg border bg-background">
                    <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', STATUS_COLOR[item.status])} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground break-words">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-red-600">Health Check를 불러오지 못했습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
