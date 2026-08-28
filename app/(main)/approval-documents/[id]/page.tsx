'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileCheck2, Loader2, ArrowUp, ArrowDown, Plus, Trash2, Save, Link2, RefreshCw, Lock, Unlock, Copy, Check, FileType2, FileOutput, Sparkles, AlertTriangle, ShieldCheck, History, GripVertical } from 'lucide-react';
import { SECTION_DEFINITIONS } from '@/lib/approval-doc/section-registry';

interface ValidationIssueRow { key: string; severity: 'blocking' | 'warning'; sectionType?: string; message: string; acknowledged: boolean }
interface AuditLogRow { id: string; action: string; actorType: 'internal' | 'external'; actorUserName: string | null; submissionVersion: number | null; createdAt: string }

const AUDIT_ACTION_LABEL: Record<string, string> = {
  project_create: '프로젝트 생성', project_update: '프로젝트 수정',
  section_toggle: '섹션 포함/제외', section_reorder: '섹션 구성 변경', section_create: '섹션 추가', section_delete: '섹션 삭제',
  link_create: '링크 생성', link_reissue: '링크 재발급',
  draft_save: '임시저장', submit: '제출', resubmit: '재제출',
  file_upload: '파일 업로드', file_replace: '파일 교체', file_delete: '파일 삭제',
  close: '마감', reopen: '마감 해제', new_revision: '새 개정본 생성',
  generate_docx: 'DOCX 생성', generate_pdf: 'PDF 생성',
  download_docx: 'DOCX 다운로드', download_pdf: 'PDF 다운로드', download_xlsx: 'XLSX 다운로드', download_zip: 'ZIP 다운로드',
  template_change: '템플릿 변경', brand_profile_apply: '브랜드 적용', brand_profile_create: '브랜드 프로필 생성',
  validation_override: '검증 확인 처리',
};

interface ProjectDetail {
  id: string; businessId: string; productName: string; modelName: string;
  docType: string; revision: string; customerName?: string; supplierName?: string;
  status: string; defaultLanguage: string; finalLanguage: string; dueDate?: string; memo?: string;
}

interface SectionRow {
  id: string; sectionType: string; included: boolean; sortOrder: number;
  customTitle: string | null; previewChapterNumber: number | null;
}

const TITLE_BY_TYPE: Record<string, string> = Object.fromEntries(SECTION_DEFINITIONS.map(d => [d.key, d.title.ko]));

function displayTitle(s: SectionRow): string {
  if (s.customTitle?.trim()) return s.customTitle;
  return TITLE_BY_TYPE[s.sectionType] || s.sectionType;
}

export default function ApprovalDocumentDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [hasActiveLink, setHasActiveLink] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [issues, setIssues] = useState<ValidationIssueRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/approval-documents/${id}`).then(r => r.json()),
      fetch(`/api/approval-documents/${id}/sections`).then(r => r.json()),
    ]).then(([p, s]) => {
      setProject(p.data);
      setSections((s.data || []).slice().sort((a: SectionRow, b: SectionRow) => a.sortOrder - b.sortOrder));
      setDirty(false);
    }).finally(() => setLoading(false));
    fetch(`/api/approval-documents/${id}/link`).then(r => r.json()).then(j => {
      setHasActiveLink(!!j.data?.hasActiveLink);
      if (j.data?.url) setLinkUrl(j.data.url);
    }).catch(() => {});
    fetch(`/api/approval-documents/${id}/validate`).then(r => r.json()).then(j => setIssues(j.data || [])).catch(() => {});
    fetch(`/api/approval-documents/${id}/audit`).then(r => r.json()).then(j => setAuditLogs(j.data || [])).catch(() => {});
  }, [id]);

  const acknowledgeIssue = async (issueKey: string) => {
    const note = prompt('확인 사유(선택)') || undefined;
    const r = await fetch(`/api/approval-documents/${id}/validate/acknowledge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issueKey, note }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error || '처리 실패'); return; }
    load();
  };

  useEffect(() => { if (id) load(); }, [id, load]);

  const createOrReissueLink = async (reissue: boolean) => {
    if (reissue && !confirm('기존 링크를 폐기하고 새 링크를 발급할까요? 기존 링크는 더 이상 사용할 수 없습니다.')) return;
    setLinkBusy(true);
    try {
      const r = await fetch(`/api/approval-documents/${id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reissue ? '보안상 재발급' : undefined }) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '실패'); return; }
      setLinkUrl(j.data.url);
      load();
    } finally { setLinkBusy(false); }
  };

  const copyLink = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`/api/approval-documents/${id}/generate`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '생성 실패'); return; }
      alert(`문서가 생성되었습니다. (전체 ${j.data.pageCount ?? '?'}페이지)${j.data.warning ? '\n\n' + j.data.warning : ''}`);
    } finally { setGenerating(false); }
  };

  const toggleClose = async () => {
    if (!project) return;
    const isClosed = project.status === 'closed';
    const msg = isClosed
      ? '마감을 해제하면 공급업체가 기존 링크에서 다시 내용을 수정하고 제출할 수 있습니다. 마감을 해제하시겠습니까?'
      : '마감하면 공급업체 링크에서 더 이상 내용을 수정하거나 제출할 수 없습니다. 마감하시겠습니까?';
    if (!confirm(msg)) return;
    const reason = prompt(isClosed ? '마감 해제 사유(선택)' : '마감 사유(선택)') || undefined;
    const r = await fetch(`/api/approval-documents/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: isClosed ? 'reopen' : 'close', reason }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '처리 실패'); return; }
    load();
  };

  const createNewRevision = async () => {
    if (!confirm('새 개정본을 만들면 마감이 해제되고 다음 개정번호로 다시 편집할 수 있게 됩니다. 계속할까요?')) return;
    const r = await fetch(`/api/approval-documents/${id}/new-revision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '처리 실패'); return; }
    alert(`Rev.${j.data.revision}로 새 개정본이 시작되었습니다.`);
    load();
  };

  const toggleIncluded = (secId: string) => {
    setSections(list => list.map(s => s.id === secId ? { ...s, included: !s.included } : s));
    setDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    setSections(list => {
      const next = list.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return list;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setDirty(true);
  };

  const moveTo = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setSections(list => {
      const next = list.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setDirty(true);
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const addCustomSection = () => {
    const title = prompt('새 사용자 정의 섹션의 제목을 입력하세요.');
    if (!title?.trim()) return;
    setSections(list => [
      ...list,
      { id: `new-${Date.now()}`, sectionType: 'custom', included: true, sortOrder: list.length, customTitle: title.trim(), previewChapterNumber: null },
    ]);
    setDirty(true);
  };

  const removeNewSection = (secId: string) => {
    // 아직 저장 안 된(서버에 없는) 커스텀 섹션만 화면에서 즉시 제거 가능 — 이미 저장된
    // 섹션은 "제외"(included=false) 처리만 지원한다(요청서: 내용 있는 섹션은 임의로 삭제하지
    // 않는다는 원칙과 일관되게, 삭제는 이후 Phase에서 명시적 확인을 거치는 별도 액션으로 추가).
    if (!secId.startsWith('new-')) return;
    setSections(list => list.filter(s => s.id !== secId).map((s, i) => ({ ...s, sortOrder: i })));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = sections.map(s => ({
        id: s.id.startsWith('new-') ? undefined : s.id,
        sectionType: s.sectionType, included: s.included, sortOrder: s.sortOrder, customTitle: s.customTitle,
      }));
      const r = await fetch(`/api/approval-documents/${id}/sections`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: payload }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '저장 실패'); return; }
      load();
    } finally { setSaving(false); }
  };

  if (loading || !project) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`${project.businessId} — ${project.productName}`} icon={<FileCheck2 className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4 max-w-4xl mx-auto w-full">
        <div className="bg-card border rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">모델명</span><div>{project.modelName}</div></div>
          <div><span className="text-muted-foreground">개정번호</span><div>Rev. {project.revision}</div></div>
          <div><span className="text-muted-foreground">공급업체</span><div>{project.supplierName || '-'}</div></div>
          <div><span className="text-muted-foreground">고객사</span><div>{project.customerName || '-'}</div></div>
          <div><span className="text-muted-foreground">상태</span><div>{project.status}</div></div>
          <div><span className="text-muted-foreground">제출기한</span><div>{project.dueDate || '-'}</div></div>
        </div>

        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4" />공급업체 작성 링크</span>
            <div className="flex gap-2">
              {!hasActiveLink ? (
                <Button size="sm" onClick={() => createOrReissueLink(false)} disabled={linkBusy}>{linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '자료 작성 링크 만들기'}</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => createOrReissueLink(true)} disabled={linkBusy} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />링크 재발급</Button>
              )}
              <Button size="sm" variant={project.status === 'closed' ? 'outline' : 'destructive'} onClick={toggleClose} className="gap-1">
                {project.status === 'closed' ? <><Unlock className="w-3.5 h-3.5" />마감 해제하기</> : <><Lock className="w-3.5 h-3.5" />마감하기</>}
              </Button>
              {project.status === 'closed' && (
                <Button size="sm" variant="outline" onClick={createNewRevision} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />새 개정본 생성</Button>
              )}
            </div>
          </div>
          {linkUrl && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-xs">
              <span className="flex-1 truncate font-mono">{linkUrl}</span>
              <button onClick={copyLink} className="text-primary hover:underline flex items-center gap-1 shrink-0">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? '복사됨' : '복사'}
              </button>
            </div>
          )}
          {!linkUrl && hasActiveLink && <p className="text-xs text-muted-foreground">링크 원문을 불러오지 못했습니다. 필요하면 재발급하세요.</p>}
        </div>

        <div className="bg-card border rounded-xl p-4 flex items-center gap-2">
          <span className="text-sm font-semibold mr-auto flex items-center gap-1.5"><Sparkles className="w-4 h-4" />문서 생성 및 다운로드</span>
          <Button size="sm" onClick={generate} disabled={generating} className="gap-1">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? '생성 중...' : '문서 생성'}
          </Button>
          <a href={`/api/approval-documents/${id}/download/docx`}><Button size="sm" variant="outline" className="gap-1"><FileType2 className="w-3.5 h-3.5" />DOCX</Button></a>
          <a href={`/api/approval-documents/${id}/download/pdf`}><Button size="sm" variant="outline" className="gap-1"><FileOutput className="w-3.5 h-3.5" />PDF</Button></a>
          <a href={`/api/approval-documents/${id}/download/zip`}><Button size="sm" variant="outline" className="gap-1"><FileType2 className="w-3.5 h-3.5" />전체 패키지 ZIP</Button></a>
        </div>

        {issues.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <span className="text-sm font-semibold flex items-center gap-1.5 mb-2"><ShieldCheck className="w-4 h-4" />교차검증 결과 ({issues.length}건)</span>
            <div className="space-y-1.5">
              {issues.map(issue => (
                <div key={issue.key} className={`flex items-start gap-2 text-xs px-2.5 py-2 rounded-lg ${issue.severity === 'blocking' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="flex-1">
                    <span className="font-semibold">[{issue.severity === 'blocking' ? '필수' : '권장'}]</span> {issue.message}
                    {issue.acknowledged && <span className="ml-1.5 text-muted-foreground">(확인됨)</span>}
                  </span>
                  {issue.severity === 'blocking' && !issue.acknowledged && (
                    <button onClick={() => acknowledgeIssue(issue.key)} className="shrink-0 underline hover:no-underline">확인 처리</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card border rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <span className="font-semibold text-sm">섹션 구성</span>
              <span className="text-xs text-muted-foreground ml-2">포함한 섹션만 최종 문서에 출력되며, 순서를 바꾸면 장번호도 자동으로 다시 매겨집니다.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addCustomSection} className="gap-1"><Plus className="w-3.5 h-3.5" />사용자 정의 섹션</Button>
              <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}저장
              </Button>
            </div>
          </div>
          <div className="divide-y">
            {sections.map((s, idx) => (
              <div
                key={s.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                onDrop={e => { e.preventDefault(); if (dragIdx != null) moveTo(dragIdx, idx); setDragIdx(null); setDragOverIdx(null); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                className={`flex items-center gap-3 px-4 py-2.5 ${dragOverIdx === idx && dragIdx !== idx ? 'bg-primary/5 border-t-2 border-primary' : ''}`}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
                <input type="checkbox" checked={s.included} onChange={() => toggleIncluded(s.id)} className="w-4 h-4" />
                <span className="w-8 text-xs text-muted-foreground text-right shrink-0">
                  {s.included && s.previewChapterNumber != null ? `${s.previewChapterNumber}장` : ''}
                </span>
                {s.sectionType === 'custom' && s.id.startsWith('new-') ? (
                  <Input
                    value={s.customTitle || ''}
                    onChange={e => { setSections(list => list.map(x => x.id === s.id ? { ...x, customTitle: e.target.value } : x)); setDirty(true); }}
                    className="flex-1 h-8"
                  />
                ) : (
                  <span className={`flex-1 text-sm ${s.included ? '' : 'text-muted-foreground line-through'}`}>{displayTitle(s)}</span>
                )}
                {s.sectionType === 'custom' && <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">사용자 정의</span>}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 disabled:opacity-30 hover:bg-muted rounded"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === sections.length - 1} className="p-1 disabled:opacity-30 hover:bg-muted rounded"><ArrowDown className="w-3.5 h-3.5" /></button>
                  {s.id.startsWith('new-') && (
                    <button onClick={() => removeNewSection(s.id)} className="p-1 hover:bg-muted rounded text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4">
          <span className="text-sm font-semibold flex items-center gap-1.5 mb-2"><History className="w-4 h-4" />감사 로그</span>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="font-medium">{AUDIT_ACTION_LABEL[log.action] || log.action}</span>
                  <span className="text-muted-foreground">{log.actorType === 'external' ? '(외부)' : ''}{log.actorUserName ? ` ${log.actorUserName}` : ''}</span>
                  {log.submissionVersion != null && <span className="text-muted-foreground">v{log.submissionVersion}</span>}
                  <span className="ml-auto text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString('ko-KR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
