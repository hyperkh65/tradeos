'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, Plus, Pencil, Trash2, ArrowUp, ArrowDown,
  Sparkles, Sliders, MessageSquareText, RotateCcw, AlertTriangle, Database, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'providers' | 'flags' | 'prompts' | 'indexing';
type ProviderType = 'cloudflare' | 'gemini' | 'anthropic' | 'openai' | 'ollama' | 'openai_compatible';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  cloudflare: 'Cloudflare Workers AI', gemini: 'Google Gemini', anthropic: 'Anthropic Claude',
  openai: 'OpenAI', ollama: 'Ollama(자체호스팅)', openai_compatible: 'OpenAI 호환 API',
};
const IMPLEMENTED_TYPES: ProviderType[] = ['cloudflare', 'openai', 'openai_compatible', 'anthropic', 'gemini', 'ollama'];

interface ProviderRow {
  id: string; name: string; providerType: ProviderType; enabled: boolean; priority: number;
  accountId: string | null; baseUrl: string | null; chatModel: string | null; embeddingModel: string | null;
  supportsChat: boolean; supportsEmbedding: boolean;
  hasApiToken: boolean; apiTokenMasked: string | null;
  status: 'healthy' | 'degraded' | 'cooldown' | 'disabled' | 'error';
  lastSuccessAt: string | null; lastFailureAt: string | null; failureCount: number;
  cooldownUntil: string | null; lastError: string | null;
  createdByName: string | null; createdAt: string; updatedAt: string;
}

const STATUS_STYLE: Record<ProviderRow['status'], string> = {
  healthy: 'bg-green-500', degraded: 'bg-yellow-500', cooldown: 'bg-yellow-500',
  disabled: 'bg-gray-300', error: 'bg-red-500',
};
const STATUS_LABEL: Record<ProviderRow['status'], string> = {
  healthy: '정상', degraded: '저하', cooldown: '쿨다운', disabled: '비활성', error: '오류',
};

interface AISettings {
  enabled: boolean; effectiveEnabled: boolean; serverForcedDisabled: boolean;
  rateLimitPerUserPerHour: number; searchTopK: number;
  qdrantUrl: string | null; hasQdrantApiKey: boolean; qdrantCollection: string;
}

interface PromptItem { key: string; default: string; custom: string | null; effective: string }

interface IndexEstimate {
  bySourceType: Record<string, number>; totalCount: number;
  documentIndex: Record<string, number>; jobs: Record<string, number>; qdrantConfigured: boolean;
}
interface IndexStatus {
  documentIndex: Record<string, number>; jobs: Record<string, number>;
  recentFailed: { sourceType: string; sourceId: string; title: string | null; error: string | null; updatedAt: string }[];
  qdrant: { configured: boolean; connected: boolean; pointsCount: number; vectorSize: number | null; error?: string };
}
const SOURCE_TYPE_LABELS: Record<string, string> = { product: '제품', inspection: '검품', claim: '클레임', attachment: '첨부파일' };
const PROMPT_LABELS: Record<string, string> = {
  base: '기본 시스템 프롬프트', rag_answer: '자료 검색 답변 프롬프트',
  draft_writing: '초안 작성 프롬프트', tool_selection: '도구 선택 프롬프트',
};

export default function AISettingsPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [tab, setTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [editing, setEditing] = useState<ProviderRow | 'new' | null>(null);

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);

  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexEstimate, setIndexEstimate] = useState<IndexEstimate | null>(null);
  const [indexBusy, setIndexBusy] = useState<'reindex' | 'retry' | 'qdrant-test' | null>(null);
  const [qdrantTestResult, setQdrantTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadProviders = useCallback(() => {
    fetch('/api/ai/providers').then(r => r.json()).then(j => { if (Array.isArray(j.data)) setProviders(j.data); });
  }, []);
  const loadSettings = useCallback(() => {
    fetch('/api/ai/settings').then(r => r.json()).then(j => { if (j.data) setSettings(j.data); });
  }, []);
  const loadPrompts = useCallback(() => {
    fetch('/api/ai/prompts').then(r => r.json()).then(j => {
      if (Array.isArray(j.data)) {
        setPrompts(j.data);
        setPromptDrafts(Object.fromEntries(j.data.map((p: PromptItem) => [p.key, p.effective])));
      }
    });
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user ?? null));
  }, []);

  useEffect(() => {
    if (!me) return;
    if (me.role !== 'admin') { setLoading(false); return; }
    Promise.all([
      fetch('/api/ai/providers').then(r => r.json()),
      fetch('/api/ai/settings').then(r => r.json()),
      fetch('/api/ai/prompts').then(r => r.json()),
    ]).then(([p, s, pr]) => {
      if (Array.isArray(p.data)) setProviders(p.data);
      if (s.data) setSettings(s.data);
      if (Array.isArray(pr.data)) {
        setPrompts(pr.data);
        setPromptDrafts(Object.fromEntries(pr.data.map((x: PromptItem) => [x.key, x.effective])));
      }
    }).finally(() => setLoading(false));
  }, [me]);

  const runTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/ai/providers/${id}/test`, { method: 'POST' });
      const j = await res.json();
      setTestResults(prev => ({ ...prev, [id]: { ok: !!j.ok, message: j.message || j.error || '' } }));
      loadProviders();
    } finally {
      setTesting(null);
    }
  };

  const removeProvider = async (id: string) => {
    if (!confirm('이 Provider 연결을 삭제할까요? 등록된 계정/토큰 정보가 함께 삭제됩니다.')) return;
    const res = await fetch(`/api/ai/providers/${id}`, { method: 'DELETE' });
    if (res.ok) { showMsg('success', '삭제되었습니다.'); loadProviders(); }
    else showMsg('error', '삭제에 실패했습니다.');
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...providers];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setProviders(next);
    await fetch('/api/ai/providers/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(p => p.id) }),
    });
    loadProviders();
  };

  const saveSettings = async (patch: Partial<AISettings & { qdrantApiKey?: string }>) => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await res.json();
      if (res.ok) { setSettings(j.data); showMsg('success', '설정이 저장됐습니다.'); }
      else showMsg('error', j.error ?? '저장 실패');
    } finally { setSavingSettings(false); }
  };

  const loadIndexStatus = useCallback(() => {
    Promise.all([
      fetch('/api/ai/index/status').then(r => r.json()),
      fetch('/api/ai/index/estimate').then(r => r.json()),
    ]).then(([s, e]) => {
      if (s.data) setIndexStatus(s.data);
      if (e.data) setIndexEstimate(e.data);
    });
  }, []);

  useEffect(() => {
    if (tab === 'indexing' && me?.role === 'admin') loadIndexStatus();
  }, [tab, me, loadIndexStatus]);

  const runReindexAll = async () => {
    if (!confirm('전체 재인덱싱을 큐에 등록할까요? 변경되지 않은 문서는 자동으로 건너뜁니다.')) return;
    setIndexBusy('reindex');
    try {
      const res = await fetch('/api/ai/index/reindex-all', { method: 'POST' });
      const j = await res.json();
      if (res.ok) { showMsg('success', `${j.data.enqueued}건 큐에 등록됨(이미 대기중이던 ${j.data.skipped}건 제외).`); loadIndexStatus(); }
      else showMsg('error', j.error ?? '실패');
    } finally { setIndexBusy(null); }
  };

  const runRetryFailed = async () => {
    setIndexBusy('retry');
    try {
      const res = await fetch('/api/ai/index/retry-failed', { method: 'POST' });
      const j = await res.json();
      if (res.ok) { showMsg('success', `실패한 ${j.data.totalFailed}건 중 ${j.data.enqueued}건 재시도 등록됨.`); loadIndexStatus(); }
      else showMsg('error', j.error ?? '실패');
    } finally { setIndexBusy(null); }
  };

  const runQdrantTest = async () => {
    setIndexBusy('qdrant-test');
    try {
      const res = await fetch('/api/ai/qdrant/test', { method: 'POST' });
      const j = await res.json();
      setQdrantTestResult({ ok: !!j.ok, message: j.message || j.error || '' });
      loadIndexStatus();
    } finally { setIndexBusy(null); }
  };

  const savePrompt = async (key: string, value: string | null) => {
    setSavingPrompt(key);
    try {
      const res = await fetch('/api/ai/prompts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }),
      });
      const j = await res.json();
      if (res.ok) {
        showMsg('success', value === null ? '기본값으로 복원했습니다.' : '프롬프트가 저장됐습니다.');
        loadPrompts();
      } else showMsg('error', j.error ?? '저장 실패');
    } finally { setSavingPrompt(null); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!me || me.role !== 'admin') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <AppHeader title="AI 도우미 설정" />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">관리자만 접근할 수 있습니다.</div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'providers', label: 'Provider 연결', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'flags', label: '기능 설정', icon: <Sliders className="w-4 h-4" /> },
    { id: 'prompts', label: '프롬프트', icon: <MessageSquareText className="w-4 h-4" /> },
    { id: 'indexing', label: '자료 인덱싱', icon: <Database className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="AI 도우미 설정" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">

          {msg && (
            <div className={cn('mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2', msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
              {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}{msg.text}
            </div>
          )}

          <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap', tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {tab === 'providers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">우선순위가 높은(위쪽) Provider부터 시도하고, 실패 시 자동으로 다음 Provider로 넘어갑니다.</p>
                <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1" />연결 추가</Button>
              </div>

              {providers.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-lg">
                  등록된 AI Provider 연결이 없습니다. &quot;연결 추가&quot;로 Cloudflare 계정을 등록하세요.
                </div>
              )}

              <div className="space-y-2">
                {providers.map((p, idx) => (
                  <div key={p.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-muted-foreground disabled:opacity-20 hover:text-foreground"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button disabled={idx === providers.length - 1} onClick={() => move(idx, 1)} className="text-muted-foreground disabled:opacity-20 hover:text-foreground"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                      <span className={cn('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', STATUS_STYLE[p.status])} title={STATUS_LABEL[p.status]} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[p.providerType]}</span>
                          {!p.enabled && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">비활성</span>}
                          {!IMPLEMENTED_TYPES.includes(p.providerType) && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">미구현 어댑터</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                          {p.chatModel && <span>채팅: {p.chatModel}</span>}
                          {p.embeddingModel && <span>임베딩: {p.embeddingModel}</span>}
                          {p.apiTokenMasked && <span>토큰: {p.apiTokenMasked}</span>}
                        </div>
                        {p.lastError && p.status !== 'healthy' && (
                          <div className="text-xs text-red-600 mt-1">{p.lastError}</div>
                        )}
                        {testResults[p.id] && (
                          <div className={cn('text-xs mt-1 flex items-center gap-1', testResults[p.id].ok ? 'text-green-600' : 'text-red-600')}>
                            {testResults[p.id].ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {testResults[p.id].message}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" disabled={testing === p.id} onClick={() => runTest(p.id)}>
                          {testing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '연결 테스트'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => removeProvider(p.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'flags' && settings && (
            <div className="space-y-6 max-w-lg">
              {settings.serverForcedDisabled && (
                <div className="px-4 py-2.5 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  서버 환경변수(AI_ENABLED=false)로 AI 기능이 강제 비활성화되어 있습니다. 아래 토글과 무관하게 전체 사용자에게 숨겨집니다.
                </div>
              )}
              <label className="flex items-center justify-between border border-border rounded-lg p-4">
                <div>
                  <div className="font-medium text-sm">AI 도우미 사용</div>
                  <div className="text-xs text-muted-foreground mt-0.5">켜면 전체 사용자 화면 우측 하단에 AI 도우미 버튼이 표시됩니다.</div>
                </div>
                <input type="checkbox" className="w-5 h-5" checked={settings.enabled} onChange={e => saveSettings({ enabled: e.target.checked })} disabled={savingSettings} />
              </label>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="font-medium text-sm">사용자별 시간당 요청 제한</div>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} className="w-28" defaultValue={settings.rateLimitPerUserPerHour}
                    onBlur={e => { const v = Number(e.target.value); if (v > 0) saveSettings({ rateLimitPerUserPerHour: v }); }} />
                  <span className="text-sm text-muted-foreground">회 / 시간</span>
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="font-medium text-sm">자료 검색 결과 개수 (Top-K)</div>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={30} className="w-28" defaultValue={settings.searchTopK}
                    onBlur={e => { const v = Number(e.target.value); if (v > 0) saveSettings({ searchTopK: v }); }} />
                  <span className="text-sm text-muted-foreground">건</span>
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="font-medium text-sm">Qdrant (자료 검색 저장소)</div>
                <div className="text-xs text-muted-foreground -mt-2">NAS 내부망에서 접근 가능한 Qdrant 주소를 입력하세요. 비워두면 서버 환경변수(QDRANT_URL)를 대신 사용합니다.</div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">URL</label>
                  <Input defaultValue={settings.qdrantUrl ?? ''} placeholder="http://qdrant:6333" onBlur={e => saveSettings({ qdrantUrl: e.target.value || null })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">API 키 {settings.hasQdrantApiKey && <span>(설정됨 — 비워두면 유지)</span>}</label>
                  <Input type="password" placeholder={settings.hasQdrantApiKey ? '변경하려면 새 값 입력' : '(선택) 내부망이면 비워둬도 됩니다'} onBlur={e => { if (e.target.value) saveSettings({ qdrantApiKey: e.target.value }); }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">컬렉션 이름</label>
                  <Input defaultValue={settings.qdrantCollection} onBlur={e => { if (e.target.value.trim()) saveSettings({ qdrantCollection: e.target.value.trim() }); }} />
                </div>
              </div>
            </div>
          )}

          {tab === 'prompts' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">각 영역별 프롬프트를 재정의할 수 있습니다. 비워두고 저장하면 코드 기본값을 사용합니다.</p>
              {prompts.map(p => (
                <div key={p.key} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{PROMPT_LABELS[p.key] || p.key}</div>
                    {p.custom !== null && (
                      <Button size="sm" variant="ghost" onClick={() => { savePrompt(p.key, null); setPromptDrafts(prev => ({ ...prev, [p.key]: p.default })); }}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />기본값 복원
                      </Button>
                    )}
                  </div>
                  <textarea
                    className="w-full min-h-[140px] text-sm border border-border rounded-md p-2 font-mono"
                    value={promptDrafts[p.key] ?? p.effective}
                    onChange={e => setPromptDrafts(prev => ({ ...prev, [p.key]: e.target.value }))}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={savingPrompt === p.key} onClick={() => savePrompt(p.key, promptDrafts[p.key] ?? p.effective)}>
                      {savingPrompt === p.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '저장'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'indexing' && (
            <div className="space-y-5">
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Qdrant 연결</div>
                  <Button size="sm" variant="outline" disabled={indexBusy === 'qdrant-test'} onClick={runQdrantTest}>
                    {indexBusy === 'qdrant-test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '연결 테스트'}
                  </Button>
                </div>
                {indexStatus?.qdrant && (
                  <div className="text-xs text-muted-foreground">
                    {indexStatus.qdrant.configured
                      ? (indexStatus.qdrant.connected
                        ? `연결됨 — 벡터 ${indexStatus.qdrant.pointsCount}개${indexStatus.qdrant.vectorSize ? `, 차원 ${indexStatus.qdrant.vectorSize}` : ''}`
                        : `연결 안 됨${indexStatus.qdrant.error ? `: ${indexStatus.qdrant.error}` : ''}`)
                      : '아직 Qdrant URL이 설정되지 않았습니다. 기능 설정 탭에서 등록하세요.'}
                  </div>
                )}
                {qdrantTestResult && (
                  <div className={cn('text-xs flex items-center gap-1', qdrantTestResult.ok ? 'text-green-600' : 'text-red-600')}>
                    {qdrantTestResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {qdrantTestResult.message}
                  </div>
                )}
              </div>

              {indexEstimate && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="font-medium text-sm">인덱싱 대상 현황</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {Object.entries(indexEstimate.bySourceType).map(([type, count]) => (
                      <div key={type} className="border border-border rounded-md p-2 text-center">
                        <div className="text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[type] || type}</div>
                        <div className="font-semibold">{count}건</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    인덱싱 완료 {indexEstimate.documentIndex.indexed ?? 0}건 · 실패 {indexEstimate.documentIndex.failed ?? 0}건 ·
                    대기중 작업 {(indexEstimate.jobs.pending ?? 0) + (indexEstimate.jobs.processing ?? 0) + (indexEstimate.jobs.retrying ?? 0)}건
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={indexBusy === 'reindex'} onClick={runReindexAll}>
                      {indexBusy === 'reindex' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                      전체 재인덱싱
                    </Button>
                    {(indexEstimate.documentIndex.failed ?? 0) > 0 && (
                      <Button size="sm" variant="outline" disabled={indexBusy === 'retry'} onClick={runRetryFailed}>
                        {indexBusy === 'retry' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                        실패건 재시도
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    현재는 제품/검품/클레임 데이터와 검품·클레임에 첨부된 리포트 파일(PDF/DOCX/XLSX/TXT/CSV)을 대상으로 합니다.
                    사진 등 이미지 첨부파일은 문자 인식(OCR)이 필요해 이번 범위에서는 제외했습니다.
                    변경되지 않은 문서는 자동으로 건너뛰어 불필요한 재임베딩을 하지 않습니다.
                    제품/검품/클레임을 저장·삭제하면 자동으로 이 목록에 반영됩니다(백그라운드에서 10초 주기로 처리).
                  </p>
                </div>
              )}

              {indexStatus && indexStatus.recentFailed.length > 0 && (
                <div className="border border-border rounded-lg p-4 space-y-2">
                  <div className="font-medium text-sm text-red-600">최근 실패 목록</div>
                  {indexStatus.recentFailed.map(f => (
                    <div key={`${f.sourceType}-${f.sourceId}`} className="text-xs border-b border-border pb-1.5 last:border-0">
                      <span className="font-medium">{SOURCE_TYPE_LABELS[f.sourceType] || f.sourceType}</span> — {f.title || f.sourceId}
                      {f.error && <div className="text-red-500">{f.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ProviderModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadProviders(); }}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}

function ProviderModal({ initial, onClose, onSaved, showMsg }: {
  initial: ProviderRow | null;
  onClose: () => void;
  onSaved: () => void;
  showMsg: (type: 'success' | 'error', text: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [providerType, setProviderType] = useState<ProviderType>(initial?.providerType ?? 'cloudflare');
  const [priority, setPriority] = useState(initial?.priority ?? 100);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [apiToken, setApiToken] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [chatModel, setChatModel] = useState(initial?.chatModel ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const [embeddingModel, setEmbeddingModel] = useState(initial?.embeddingModel ?? '@cf/baai/bge-base-en-v1.5');
  const [supportsChat, setSupportsChat] = useState(initial?.supportsChat ?? true);
  const [supportsEmbedding, setSupportsEmbedding] = useState(initial?.supportsEmbedding ?? (initial ? initial.supportsEmbedding : true));
  const [saving, setSaving] = useState(false);

  const isCloudflare = providerType === 'cloudflare';

  const save = async () => {
    if (!name.trim()) { showMsg('error', '이름을 입력하세요.'); return; }
    if (isCloudflare && !accountId.trim() && !initial) { showMsg('error', 'Cloudflare Account ID를 입력하세요.'); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(), providerType, priority, enabled,
        accountId: accountId.trim() || null, baseUrl: baseUrl.trim() || null,
        chatModel: chatModel.trim() || null, embeddingModel: embeddingModel.trim() || null,
        supportsChat, supportsEmbedding,
        ...(apiToken ? { apiToken } : {}),
      };
      const res = await fetch(initial ? `/api/ai/providers/${initial.id}` : '/api/ai/providers', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (res.ok) { showMsg('success', '저장됐습니다.'); onSaved(); }
      else showMsg('error', j.error ?? '저장 실패');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2" onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold">{initial ? 'Provider 연결 수정' : 'Provider 연결 추가'}</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">이름</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: Cloudflare 1계정" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Provider 유형</label>
            <select className="w-full border border-border rounded-md h-9 px-2 text-sm" value={providerType} onChange={e => setProviderType(e.target.value as ProviderType)} disabled={!!initial}>
              {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map(t => (
                <option key={t} value={t}>{PROVIDER_LABELS[t]}{!IMPLEMENTED_TYPES.includes(t) ? ' (미구현)' : ''}</option>
              ))}
            </select>
          </div>
          {!IMPLEMENTED_TYPES.includes(providerType) && (
            <div className="text-xs px-3 py-2 rounded bg-amber-50 text-amber-700">
              이 Provider 유형은 아직 실제 연동이 구현되지 않았습니다. 등록은 가능하지만, 활성화하면 호출 시 오류로 처리되어 다음 Provider로 넘어갑니다.
            </div>
          )}
          {isCloudflare && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cloudflare Account ID</label>
              <Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="Cloudflare 대시보드 우측에서 확인" />
            </div>
          )}
          {(providerType === 'ollama' || providerType === 'openai_compatible') && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Base URL{providerType === 'ollama' ? '' : ' (필수)'}</label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={providerType === 'ollama' ? 'http://내부호스트:11434' : 'http://내부호스트:포트/v1'} />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">API 토큰 {initial?.hasApiToken && <span className="text-muted-foreground">(입력 시 교체, 비워두면 기존 값 유지 — 현재: {initial.apiTokenMasked})</span>}</label>
            <Input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder={initial?.hasApiToken ? '변경하려면 새 값 입력' : '토큰 입력'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">채팅 모델</label>
              <Input value={chatModel} onChange={e => setChatModel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">임베딩 모델</label>
              <Input value={embeddingModel} onChange={e => setEmbeddingModel(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={supportsChat} onChange={e => setSupportsChat(e.target.checked)} />채팅 사용</label>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={supportsEmbedding} onChange={e => setSupportsEmbedding(e.target.checked)} />임베딩 사용</label>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />활성화</label>
            <div className="flex items-center gap-1.5 text-sm">
              우선순위 <Input type="number" className="w-20 h-8" value={priority} onChange={e => setPriority(Number(e.target.value))} />
              <span className="text-xs text-muted-foreground">(작을수록 먼저 시도)</span>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}</Button>
        </div>
      </div>
    </div>
  );
}
