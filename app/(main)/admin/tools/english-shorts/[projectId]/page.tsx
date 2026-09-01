'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Clapperboard, Sparkles, Plus, Trash2, GripVertical, RefreshCw, LayoutTemplate, Check } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

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
  key: string; label: string; type: 'select' | 'number' | 'color' | 'boolean';
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

const fmtDuration = (s: number | null) => s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function ProjectEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
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
      const [pRes, sRes, libRes, tplRes] = await Promise.all([
        fetch(`/api/admin-tools/english-shorts/projects/${projectId}`),
        fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources`),
        fetch('/api/admin-tools/english-shorts/sources'),
        fetch('/api/admin-tools/english-shorts/templates'),
      ]);
      const pJson = await pRes.json();
      const sJson = await sRes.json();
      const libJson = await libRes.json();
      const tplJson = await tplRes.json();
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

  const addSource = async (sourceId: string) => {
    const res = await fetch(`/api/admin-tools/english-shorts/projects/${projectId}/sources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId }),
    });
    if (res.ok) load(); else { const j = await res.json().catch(() => ({})); setErrorMsg(j.error || '추가 실패'); }
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
          <h2 className="text-sm font-semibold">영상 소스 ({links.length}개)</h2>
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
      </div>
    </div>
  );
}
