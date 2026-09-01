'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Settings, HeartPulse, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface HealthItem { name: string; status: 'ok' | 'warning' | 'error'; detail: string }
interface Health { overallStatus: 'ok' | 'warning' | 'error'; checkedAt: string; items: HealthItem[] }

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

  useEffect(() => { loadHealth(); }, [loadHealth]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="English Shorts 설정" icon={<Settings className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
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
