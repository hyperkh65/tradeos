'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Loader2, Link2, RefreshCw, Lock, Unlock, Copy, FileSpreadsheet, FileType2, Check, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISPLAY_FIELDS, ATTACHMENT_CATEGORIES } from '@/lib/supplier-form/field-schema';

interface DetailData {
  project: { id: string; businessId: string; productName: string; supplierName: string; contactPerson?: string; dueDate?: string; status: string; memo?: string; createdByName?: string };
  hasActiveLink: boolean; linkCreatedAt: string | null;
  converterType: string | null;
  formData: Record<string, { original: string; korean: string; lang: string }>;
  componentItems: unknown[];
  attachments: { id: string; categoryKey: string; originalFilename: string; sizeBytes: number; createdAt: string }[];
  submissionVersions: { id: string; versionNo: number; submittedAt: string; submittedByName: string; status: string }[];
  closures: { id: string; closedByUserName: string; closedAt: string; reasonMemo?: string; reopenedAt?: string }[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨', color: 'bg-blue-100 text-blue-700' },
  editing: { label: '수정중', color: 'bg-amber-100 text-amber-700' },
  resubmitted: { label: '재제출됨', color: 'bg-indigo-100 text-indigo-700' },
  closed: { label: '마감됨', color: 'bg-red-100 text-red-700' },
};

export default function SupplierRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/supplier-requests/${id}`).then(r => r.json()).then(j => setData(j.data)).finally(() => setLoading(false));
    // 링크를 만든 본인/admin이면 재발급 없이도 원문 링크를 계속 볼 수 있어야 한다(매번 재발급하지
    // 않고도 다시 확인 가능해야 한다는 요청사항) — 별도 엔드포인트가 암호화된 원문을 복호화해 돌려준다.
    fetch(`/api/supplier-requests/${id}/link`).then(r => r.json()).then(j => { if (j.data?.url) setLinkUrl(j.data.url); }).catch(() => {});
  }, [id]);
  useEffect(load, [load]);

  const createOrReissueLink = async (reissue: boolean) => {
    if (reissue && !confirm('기존 링크를 폐기하고 새 링크를 발급할까요? 기존 링크는 더 이상 사용할 수 없습니다.')) return;
    setLinkBusy(true);
    try {
      const r = await fetch(`/api/supplier-requests/${id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reissue ? '보안상 재발급' : undefined }) });
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

  const toggleClose = async () => {
    if (!data) return;
    const isClosed = data.project.status === 'closed';
    const msg = isClosed
      ? '마감을 해제하면 공급업체가 기존 링크에서 다시 내용을 수정하고 파일을 제출할 수 있습니다. 마감을 해제하시겠습니까?'
      : '마감하면 공급업체 링크에서 더 이상 내용을 수정하거나 파일을 추가·교체·삭제할 수 없습니다. 마감하시겠습니까?';
    if (!confirm(msg)) return;
    const reason = prompt(isClosed ? '마감 해제 사유(선택)' : '마감 사유(선택)') || undefined;
    const r = await fetch(`/api/supplier-requests/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: isClosed ? 'reopen' : 'close', reason }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '처리 실패'); return; }
    load();
  };

  if (loading || !data) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const isClosed = data.project.status === 'closed';
  const statusInfo = STATUS_LABEL[data.project.status] || { label: data.project.status, color: '' };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="고효율서류요청서" icon={<ClipboardCheck className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-muted-foreground">{data.project.businessId}</span>
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusInfo.color)}>{statusInfo.label}</span>
          </div>
          <h2 className="text-lg font-bold mb-1">{data.project.productName}</h2>
          <p className="text-sm text-muted-foreground">{data.project.supplierName} {data.project.contactPerson ? `· ${data.project.contactPerson}` : ''} {data.project.dueDate ? `· 기한 ${data.project.dueDate}` : ''}</p>
        </div>

        {/* 링크 관리 */}
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4" />공급업체 작성 링크</span>
            <div className="flex gap-2">
              {!data.hasActiveLink ? (
                <Button size="sm" onClick={() => createOrReissueLink(false)} disabled={linkBusy}>{linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '자료 요청 링크 만들기'}</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => createOrReissueLink(true)} disabled={linkBusy} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />링크 재발급</Button>
              )}
              <Button size="sm" variant={isClosed ? 'outline' : 'destructive'} onClick={toggleClose} className="gap-1">
                {isClosed ? <><Unlock className="w-3.5 h-3.5" />마감 해제하기</> : <><Lock className="w-3.5 h-3.5" />마감하기</>}
              </Button>
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
          {!linkUrl && !loading && data.hasActiveLink && <p className="text-xs text-muted-foreground">이 링크는 재조회 기능 도입 이전에 발급되어 다시 표시할 수 없습니다. 필요하면 재발급하세요.</p>}
        </div>

        {/* 다운로드 */}
        <div className="bg-card border rounded-xl p-4 flex items-center gap-2">
          <span className="text-sm font-semibold mr-auto">문서 다운로드</span>
          <a href={`/api/supplier-requests/${id}/docx`}><Button size="sm" variant="outline" className="gap-1"><FileType2 className="w-3.5 h-3.5" />DOCX</Button></a>
          <a href={`/api/supplier-requests/${id}/xlsx`}><Button size="sm" variant="outline" className="gap-1"><FileSpreadsheet className="w-3.5 h-3.5" />XLSX</Button></a>
        </div>

        {/* 표시사항 요약 (클릭해서 한국어 확정값 수정 가능) */}
        <div className="bg-card border rounded-xl p-4">
          <span className="text-sm font-semibold mb-1 block">표시사항 (현재 작성본)</span>
          <p className="text-[11px] text-muted-foreground mb-3">값을 클릭하면 한국어 확정값을 직접 수정할 수 있습니다. 원문(공급업체 입력)은 그대로 보존됩니다.</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {DISPLAY_FIELDS.map(f => {
              const isComposite = f.key === 'originMarking' || f.key === 'ledPackageArrayTotal';
              const entry = data.formData[f.key];
              return (
                <div key={f.key} className="flex justify-between items-center border-b border-border/60 py-1 gap-2">
                  <span className="text-muted-foreground shrink-0">{f.label.ko}</span>
                  {isComposite ? (
                    <span className="font-medium text-right truncate" title="하위 항목 결합값 — 원문 데이터에서 자동 계산됩니다">{entry?.korean || entry?.original || '-'}</span>
                  ) : (
                    <KoreanValueEditable projectId={id} fieldKey={f.key} value={entry?.korean || entry?.original || ''} reviewed={!!(entry as { reviewed?: boolean })?.reviewed} onSaved={load} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 첨부파일 */}
        <div className="bg-card border rounded-xl p-4">
          <span className="text-sm font-semibold mb-3 block">첨부파일 ({data.attachments.length})</span>
          {data.attachments.length === 0 ? <p className="text-xs text-muted-foreground">첨부된 파일이 없습니다.</p> : (
            <div className="space-y-1">
              {data.attachments.map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs border-b border-border/60 py-1.5 gap-3">
                  <div className="min-w-0">
                    <div className="text-muted-foreground">{ATTACHMENT_CATEGORIES.find(c => c.key === a.categoryKey)?.label.ko || a.categoryKey}</div>
                    <a href={`/api/supplier-requests/${id}/files/${a.id}`} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate">
                      <Download className="w-3 h-3 shrink-0" />{a.originalFilename}
                    </a>
                  </div>
                  <span className="text-muted-foreground shrink-0">{(a.sizeBytes / 1024).toFixed(0)}KB</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 제출 이력 */}
        <div className="bg-card border rounded-xl p-4">
          <span className="text-sm font-semibold mb-3 block">제출 이력</span>
          {data.submissionVersions.length === 0 ? <p className="text-xs text-muted-foreground">아직 제출된 내역이 없습니다.</p> : (
            <div className="space-y-1">
              {data.submissionVersions.map(v => (
                <div key={v.id} className="flex items-center justify-between text-xs border-b border-border/60 py-1.5">
                  <span>v{v.versionNo} — {v.submittedByName}</span>
                  <span className="text-muted-foreground">{v.submittedAt?.slice(0, 19).replace('T', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {data.closures.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <span className="text-sm font-semibold mb-3 block">마감/마감해제 이력</span>
            <div className="space-y-1">
              {data.closures.map(c => (
                <div key={c.id} className="text-xs border-b border-border/60 py-1.5">
                  <div>마감: {c.closedByUserName} · {c.closedAt?.slice(0, 19).replace('T', ' ')} {c.reasonMemo ? `(${c.reasonMemo})` : ''}</div>
                  {c.reopenedAt && <div className="text-muted-foreground">해제: {c.reopenedAt.slice(0, 19).replace('T', ' ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <AuditLogSection projectId={id} />
      </div>
    </div>
  );
}

function KoreanValueEditable({ projectId, fieldKey, value, reviewed, onSaved }: {
  projectId: string; fieldKey: string; value: string; reviewed: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  const save = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/supplier-requests/${projectId}/korean-value`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: fieldKey, korean: draft }),
      });
      if (!r.ok) { const j = await r.json(); alert(j.error || '저장 실패'); return; }
      setEditing(false);
      onSaved();
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
          className="h-6 text-xs px-1.5 rounded border border-primary bg-background w-40 text-right" />
        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
      </span>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="font-medium text-right hover:bg-muted/60 rounded px-1 -mx-1 flex items-center gap-1 justify-end" title="클릭해서 수정">
      {value || <span className="text-muted-foreground">-</span>}
      {reviewed && <Check className="w-3 h-3 text-green-600 shrink-0" />}
    </button>
  );
}

interface AuditLogItem { id: string; action: string; actorType: string; actorUserName?: string; submissionVersion?: number; ipAddress?: string; createdAt: string }
const ACTION_LABEL: Record<string, string> = {
  link_create: '링크 생성', link_reissue: '링크 재발급', draft_save: '임시저장', submit: '제출', resubmit: '재제출',
  file_upload: '파일 업로드', file_replace: '파일 교체', file_delete: '파일 삭제', korean_value_edit: '한국어값 수정',
  close: '마감', reopen: '마감해제', download_docx: 'DOCX 다운로드', download_xlsx: 'XLSX 다운로드', project_create: '프로젝트 생성',
};

function AuditLogSection({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<AuditLogItem[] | null>(null);
  useEffect(() => {
    fetch(`/api/supplier-requests/${projectId}/audit`).then(r => r.json()).then(j => setLogs(j.data || []));
  }, [projectId]);

  return (
    <div className="bg-card border rounded-xl p-4">
      <span className="text-sm font-semibold mb-3 block">감사 로그 (최근 200건)</span>
      {!logs ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">기록이 없습니다.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1">
          {logs.map(l => (
            <div key={l.id} className="flex items-center justify-between text-[11px] border-b border-border/60 py-1">
              <span className="flex items-center gap-1.5">
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', l.actorType === 'internal' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700')}>
                  {l.actorType === 'internal' ? '내부' : '외부'}
                </span>
                {ACTION_LABEL[l.action] || l.action}
                {l.actorUserName && <span className="text-muted-foreground">· {l.actorUserName}</span>}
                {l.submissionVersion ? <span className="text-muted-foreground">v{l.submissionVersion}</span> : null}
              </span>
              <span className="text-muted-foreground">{l.createdAt?.slice(0, 19).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
