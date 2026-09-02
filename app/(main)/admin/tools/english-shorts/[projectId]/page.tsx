'use client';

import { AppHeader } from '@/components/layout/header';
import {
  Loader2, Clapperboard, Sparkles, Plus, Trash2, GripVertical, RefreshCw, LayoutTemplate, Check,
  Film, Download, Copy, Ban, X, Camera, FileVideo, Upload,
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface Expression {
  id: string; expression: string; koreanMeaning: string | null; explanation: string | null;
  examples: { en: string; ko: string }[]; suggestedTitle: string | null; suggestedDescription: string | null;
  suggestedCaption: string | null; hashtags: string[];
}
interface Project {
  id: string; businessId: string; expressionId: string; title: string | null; description: string | null;
  caption: string | null; hashtags: string[]; status: string;
  templateId: string | null; templateSettings: Record<string, unknown> | null;
}
interface TemplateSettingsField {
  key: string; label: string; type: 'select' | 'number' | 'color' | 'boolean' | 'text';
  options?: { value: string; label: string }[]; min?: number; max?: number; step?: number;
}
interface Template {
  id: string; slug: string; name: string; description: string | null;
  layout: { kind: string; defaults: Record<string, unknown>; settingsSchema: TemplateSettingsField[] };
}
interface SourceInfo {
  id: string; originalFileName: string | null; durationSec: number | null; extension: string | null;
}
interface ProjectSourceLink {
  id: string; sourceId: string; position: number; trimStartSec: number; trimEndSec: number | null; source: SourceInfo;
}
interface LibrarySource {
  id: string; originalFileName: string | null; durationSec: number | null; extension: string | null;
}
interface RenderJob {
  id: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stage: string | null; progress: number; attempts: number; lastError: string | null;
  outputVideoPath: string | null; outputDurationSec: number | null; cancelRequested: boolean;
}

const RENDER_STATUS_LABEL: Record<RenderJob['status'], string> = {
  queued: '대기 중', processing: '렌더링 중', completed: '완료', failed: '실패', cancelled: '취소됨',
};

const fmtDuration = (s: number | null) => s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function ProjectEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [startingRender, setStartingRender] = useState(false);
  const [cancellingRender, setCancellingRender] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [showMobileUpload, setShowMobileUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [expression, setExpression] = useState<Expression | null>(null);
  const [links, setLinks] = useState<ProjectSourceLink[]>([]);
  const [library, setLibrary] = useState<LibrarySource[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 템플릿 선택 + 설정값 로컬 상태(설정값 폼 — 드래그앤드롭 에디터 아님, 요청서 26번)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSettings, setTemplateSettings] = useState<Record<string, unknown>>({});

  // 프로젝트 필드 편집 로컬 상태
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes, libRes, tplRes, renderRes] = await Promise.all([
        fetch(`/api/admin-tools/english-shorts/projects/${projectId}`),
        fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources`),
        fetch('/api/admin-tools/english-shorts/sources'),
        fetch('/api/admin-tools/english-shorts/templates'),
        fetch(`/api/admin-tools/english-shorts/projects/${projectId}/render`),
      ]);
      const pJson = await pRes.json();
      const sJson = await sRes.json();
      const libJson = await libRes.json();
      const tplJson = await tplRes.json();
      const renderJson = await renderRes.json();
      if (Array.isArray(renderJson.jobs) && renderJson.jobs.length > 0) setRenderJob(renderJson.jobs[0]);
      if (pJson.project) {
        setProject(pJson.project);
        setTitle(pJson.project.title || '');
        setDescription(pJson.project.description || '');
        setCaption(pJson.project.caption || '');
        setHashtags((pJson.project.hashtags || []).join(', '));
        setSelectedTemplateId(pJson.project.templateId || null);
        setTemplateSettings(pJson.project.templateSettings || {});
      }
      if (pJson.expression) setExpression(pJson.expression);
      if (Array.isArray(sJson.sources)) setLinks(sJson.sources);
      if (Array.isArray(libJson.sources)) setLibrary(libJson.sources);
      if (Array.isArray(tplJson.templates)) setTemplates(tplJson.templates);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // 렌더 잡이 대기/처리 중이면 3초마다 상태만 가볍게 폴링(전체 load() 재호출 아님).
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!renderJob || (renderJob.status !== 'queued' && renderJob.status !== 'processing')) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/render/${renderJob.id}`);
      const j = await res.json();
      if (j.job) {
        setRenderJob(j.job);
        if (j.job.status === 'completed') load();
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderJob?.id, renderJob?.status]);

  const analyze = async (regenerate: boolean) => {
    if (!expression) return;
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin-tools/english-shorts/expressions/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expression.expression, regenerate }),
      });
      const j = await res.json();
      if (!res.ok) { setErrorMsg(j.error || 'AI 분석 실패'); return; }
      setExpression(j.expression);
      // 처음 분석됐을 때만 프로젝트 필드를 제안값으로 자동 채움(이미 손댄 값은 덮어쓰지 않음)
      if (!title) setTitle(j.expression.suggestedTitle || '');
      if (!description) setDescription(j.expression.suggestedDescription || '');
      if (!caption) setCaption(j.expression.suggestedCaption || '');
      if (!hashtags && j.expression.hashtags?.length) setHashtags(j.expression.hashtags.join(', '));
    } finally {
      setAnalyzing(false);
    }
  };

  const saveProjectFields = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, caption, hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean) }),
      });
      if (res.ok) load();
    } finally {
      setSaving(false);
    }
  };

  const pickTemplate = (tpl: Template) => {
    setSelectedTemplateId(tpl.id);
    setTemplateSettings({ ...tpl.layout.defaults });
  };

  const saveTemplateSelection = async () => {
    setSavingTemplate(true);
    try {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, templateSettings }),
      });
      if (res.ok) load();
    } finally {
      setSavingTemplate(false);
    }
  };

  const startRender = async () => {
    setStartingRender(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/render`, { method: 'POST' });
      const j = await res.json();
      if (res.status === 409) { setRenderJob(j.job); return; }
      if (!res.ok) { setErrorMsg(j.error || '렌더 시작 실패'); return; }
      setRenderJob(j.job);
    } finally {
      setStartingRender(false);
    }
  };

  const cancelRender = async () => {
    if (!renderJob) return;
    setCancellingRender(true);
    try {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/render/${renderJob.id}/cancel`, { method: 'POST' });
      const j = await res.json();
      if (j.job) setRenderJob(j.job);
    } finally {
      setCancellingRender(false);
    }
  };

  const copySummary = async () => {
    const text = [title, description, hashtags.split(',').map(h => h.trim()).filter(Boolean).map(h => `#${h}`).join(' ')]
      .filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const duplicateProject = async () => {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/duplicate`, { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.project) router.push(`/admin/tools/english-shorts/${j.project.id}`);
    } finally {
      setDuplicating(false);
    }
  };

  const addSource = async (sourceId: string) => {
    const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId }),
    });
    if (res.ok) load(); else { const j = await res.json().catch(() => ({})); setErrorMsg(j.error || '추가 실패'); }
  };

  /** 모바일에서 라이브러리를 거치지 않고 촬영/갤러리/파일 → 업로드 → 이 프로젝트에
   * 바로 연결(요청서 Phase18 — 표현입력→AI생성→프로젝트목록→소스업로드→
   * 상태확인→다운로드 흐름 중 "소스업로드" 단계를 별도 화면 이동 없이 완결). */
  const uploadAndAttach = async (file: File) => {
    setUploadingClip(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin-tools/english-shorts/sources', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setErrorMsg(j.error || '업로드 실패'); return; }
      await addSource(j.source.id);
    } finally {
      setUploadingClip(false);
    }
  };

  const removeLink = async (linkId: string) => {
    const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources/${linkId}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const updateTrim = async (linkId: string, trimStartSec: number, trimEndSec: number | null) => {
    await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources/${linkId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trimStartSec, trimEndSec }),
    });
  };

  // 네이티브 HTML5 drag & drop으로 순서 변경(요청서 33번) — 별도 라이브러리 불필요.
  const onDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return; }
    const ids = links.map(l => l.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDraggingId(null);
    const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reorder: ids }),
    });
    if (res.ok) load();
  };

  const linkedSourceIds = new Set(links.map(l => l.sourceId));
  const availableLibrary = library.filter(s => !linkedSourceIds.has(s.id));

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="프로젝트" icon={<Clapperboard className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }
  if (!project || !expression) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="프로젝트" icon={<Clapperboard className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">프로젝트를 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`${project.businessId} · ${expression.expression}`} icon={<Clapperboard className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
        {errorMsg && <div className="px-4 py-2.5 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{errorMsg}</div>}

        {/* AI 분석 */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" />AI 분석</h2>
            <button onClick={() => analyze(!!expression.koreanMeaning)} disabled={analyzing}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 flex items-center gap-1.5">
              {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : expression.koreanMeaning ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {expression.koreanMeaning ? '다시 분석하기' : 'AI로 분석하기'}
            </button>
          </div>
          {expression.koreanMeaning ? (
            <div className="text-xs space-y-1.5">
              <p><span className="text-muted-foreground">뜻:</span> {expression.koreanMeaning}</p>
              <p><span className="text-muted-foreground">설명:</span> {expression.explanation}</p>
              {expression.examples.map((ex, i) => (
                <p key={i} className="pl-3 text-muted-foreground">"{ex.en}" — {ex.ko}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">아직 분석하지 않았습니다.</p>
          )}
        </div>

        {/* 템플릿 선택 (요청서 26번 — 드래그앤드롭 에디터 대신 설정값 폼) */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4 text-primary" />템플릿</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map(tpl => (
              <button key={tpl.id} onClick={() => pickTemplate(tpl)}
                className={cn('text-left p-3 rounded-lg border text-xs space-y-1 hover:bg-muted/50',
                  selectedTemplateId === tpl.id && 'border-primary bg-primary/5')}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{tpl.name}</span>
                  {selectedTemplateId === tpl.id && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-muted-foreground">{tpl.description}</p>
              </button>
            ))}
          </div>
          {selectedTemplateId && (
            <div className="pt-2 border-t space-y-2">
              {templates.find(t => t.id === selectedTemplateId)?.layout.settingsSchema.map(field => (
                <div key={field.key} className="flex items-center justify-between gap-3">
                  <label className="text-xs text-muted-foreground shrink-0">{field.label}</label>
                  {field.type === 'select' ? (
                    <select value={String(templateSettings[field.key] ?? '')}
                      onChange={e => setTemplateSettings(s => ({ ...s, [field.key]: e.target.value }))}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : field.type === 'color' ? (
                    <input type="color" value={String(templateSettings[field.key] ?? '#FFFFFF')}
                      onChange={e => setTemplateSettings(s => ({ ...s, [field.key]: e.target.value }))}
                      className="h-8 w-14 rounded border border-input bg-background" />
                  ) : field.type === 'number' ? (
                    <input type="number" min={field.min} max={field.max} step={field.step}
                      value={Number(templateSettings[field.key] ?? 0)}
                      onChange={e => setTemplateSettings(s => ({ ...s, [field.key]: Number(e.target.value) }))}
                      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs" />
                  ) : field.type === 'text' ? (
                    <input type="text" value={String(templateSettings[field.key] ?? '')}
                      onChange={e => setTemplateSettings(s => ({ ...s, [field.key]: e.target.value }))}
                      className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs" />
                  ) : (
                    <input type="checkbox" checked={!!templateSettings[field.key]}
                      onChange={e => setTemplateSettings(s => ({ ...s, [field.key]: e.target.checked }))} />
                  )}
                </div>
              ))}
              <button onClick={saveTemplateSelection} disabled={savingTemplate}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
                {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '템플릿 저장'}
              </button>
            </div>
          )}
        </div>

        {/* 프로젝트 필드 편집 (요청서 9번 — AI 제안값을 관리자가 직접 수정 가능) */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold">제목 / 설명 / 자막 / 해시태그</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">설명</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">영상 하단 한글 뜻(짧게)</label>
            <input value={caption} onChange={e => setCaption(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">해시태그(쉼표로 구분)</label>
            <input value={hashtags} onChange={e => setHashtags(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <button onClick={saveProjectFields} disabled={saving} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
          </button>
        </div>

        {/* 소스 클립 */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">영상 소스 ({links.length}개)</h2>
            <button
              onClick={() => isMobile ? setShowMobileUpload(true) : fileInputRef.current?.click()}
              disabled={uploadingClip}
              className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5 disabled:opacity-50">
              {uploadingClip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}클립 업로드
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndAttach(f); e.target.value = ''; }} />
          <input ref={cameraInputRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndAttach(f); e.target.value = ''; setShowMobileUpload(false); }} />
          {showMobileUpload && (
            <BottomSheet onClose={() => setShowMobileUpload(false)} title="클립 업로드">
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
          {links.length === 0 ? (
            <p className="text-xs text-muted-foreground">아직 연결된 클립이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {links.map(link => (
                <div key={link.id} draggable
                  onDragStart={() => setDraggingId(link.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(link.id)}
                  className={cn('flex items-center gap-2 p-2 rounded-md border bg-background', draggingId === link.id && 'opacity-50')}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                  <span className="text-xs flex-1 truncate">{link.source.originalFileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDuration(link.source.durationSec)}</span>
                  <input type="number" min={0} step={0.1} defaultValue={link.trimStartSec}
                    onBlur={e => updateTrim(link.id, Number(e.target.value), link.trimEndSec)}
                    className="w-16 h-7 text-xs border border-input rounded px-1.5" title="시작(초)" />
                  <span className="text-xs text-muted-foreground">~</span>
                  <input type="number" min={0} step={0.1} defaultValue={link.trimEndSec ?? ''}
                    onBlur={e => updateTrim(link.id, link.trimStartSec, e.target.value ? Number(e.target.value) : null)}
                    className="w-16 h-7 text-xs border border-input rounded px-1.5" placeholder="끝" title="종료(초)" />
                  <button onClick={() => removeLink(link.id)} className="text-muted-foreground hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {availableLibrary.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">라이브러리에서 추가</p>
              <div className="flex flex-wrap gap-1.5">
                {availableLibrary.map(s => (
                  <button key={s.id} onClick={() => addSource(s.id)}
                    className="h-7 px-2.5 rounded-md border border-input text-xs hover:bg-muted/50 flex items-center gap-1">
                    <Plus className="w-3 h-3" />{s.originalFileName} ({fmtDuration(s.durationSec)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 렌더링 + 결과물 */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Film className="w-4 h-4 text-primary" />렌더링</h2>
            {renderJob && (
              <span className={cn('text-xs px-2 py-0.5 rounded-full',
                renderJob.status === 'completed' && 'bg-green-100 text-green-700',
                renderJob.status === 'failed' && 'bg-red-100 text-red-600',
                (renderJob.status === 'queued' || renderJob.status === 'processing') && 'bg-blue-100 text-blue-700',
                renderJob.status === 'cancelled' && 'bg-muted text-muted-foreground')}>
                {RENDER_STATUS_LABEL[renderJob.status]}
              </span>
            )}
          </div>

          {(!renderJob || renderJob.status === 'failed' || renderJob.status === 'cancelled') && (
            <button onClick={startRender} disabled={startingRender || links.length === 0}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
              {startingRender ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              {renderJob?.status === 'failed' ? '다시 렌더링' : '렌더링 시작'}
            </button>
          )}
          {links.length === 0 && !renderJob && <p className="text-xs text-muted-foreground">연결된 소스 클립이 있어야 렌더링할 수 있습니다.</p>}

          {renderJob && (renderJob.status === 'queued' || renderJob.status === 'processing') && (
            <div className="space-y-2">
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${renderJob.progress}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{renderJob.stage || RENDER_STATUS_LABEL[renderJob.status]} ({renderJob.progress}%)</span>
                <button onClick={cancelRender} disabled={cancellingRender || renderJob.cancelRequested}
                  className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1 disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" />{renderJob.cancelRequested ? '취소 요청됨' : '취소'}
                </button>
              </div>
            </div>
          )}

          {renderJob?.status === 'failed' && (
            <p className="text-xs text-red-600">{renderJob.lastError} (시도 {renderJob.attempts}회)</p>
          )}
          {renderJob?.status === 'cancelled' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><X className="w-3.5 h-3.5" />취소된 렌더입니다.</p>
          )}

          {renderJob?.status === 'completed' && renderJob.outputVideoPath && (
            <div className="space-y-2">
              <video controls className="w-full max-w-[240px] rounded-lg border bg-black mx-auto"
                src={`/api/admin-tools/english-shorts/projects/${projectId}/render/${renderJob.id}/download`} />
              <div className="flex flex-wrap gap-1.5">
                <a href={`/api/admin-tools/english-shorts/projects/${projectId}/render/${renderJob.id}/download`}
                  className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />다운로드
                </a>
                <button onClick={copySummary} className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" />{copiedText ? '복사됨' : '제목/설명/해시태그 복사'}
                </button>
                <button onClick={duplicateProject} disabled={duplicating}
                  className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5 disabled:opacity-50">
                  {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}복제
                </button>
                <button onClick={startRender} disabled={startingRender}
                  className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5 disabled:opacity-50">
                  {startingRender ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}재렌더링
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
