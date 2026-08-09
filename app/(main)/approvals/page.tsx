'use client';

import dynamic from 'next/dynamic';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, CheckCircle2, XCircle, Clock, X, Archive, ArchiveRestore,
  Paperclip, MessageSquare, Printer, Search, Download,
  FileText, DollarSign, Plane, ShoppingCart, Calendar,
  Trash2, Link2, Send, Pencil, Eye, ZoomIn, RotateCcw, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';

const RichEditor = dynamic(() => import('@/components/approvals/RichEditor').then(m => m.RichEditor), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApprovalStep {
  order: number;
  approverId: string;
  approverName: string;
  role: string;
  status: string;
  comment: string | null;
  actedAt: string | null;
}

interface Approval {
  id: string;
  business_id: string;
  form_type: string;
  form_title: string;
  requester_id: string;
  requester_name: string;
  requester_dept?: string;
  steps_json?: string;
  steps?: ApprovalStep[];
  current_step: number;
  status: string;
  description?: string;
  body_html?: string;
  priority: string;
  due_date?: string;
  archived: number;
  related_json?: string;
  tags_json?: string;
  created_at: string;
  updated_at: string;
}

interface Attachment {
  id: string;
  approval_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface User { id: string; name: string; department?: string; }

type Tab = 'mine' | 'pending' | 'done' | 'archive';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSteps(apr: Approval): ApprovalStep[] {
  if (Array.isArray(apr.steps)) return apr.steps;
  try { return JSON.parse(apr.steps_json ?? '[]'); } catch { return []; }
}

const statusStyle: Record<string, string> = {
  '임시저장': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  '대기': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  '진행중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  '승인': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  '반려': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

const priorityStyle: Record<string, string> = {
  low: 'text-gray-500', normal: 'text-blue-600', high: 'text-orange-600', urgent: 'text-red-600',
};
const priorityLabel: Record<string, string> = {
  low: '낮음', normal: '보통', high: '높음', urgent: '긴급',
};

const formTypes = [
  { id: '일반', label: '일반기안', icon: FileText, color: 'bg-gray-500' },
  { id: '지출', label: '지출결의', icon: DollarSign, color: 'bg-green-600' },
  { id: '휴가', label: '휴가신청', icon: Calendar, color: 'bg-blue-500' },
  { id: '출장', label: '출장신청', icon: Plane, color: 'bg-purple-500' },
  { id: '구매', label: '구매요청', icon: ShoppingCart, color: 'bg-orange-500' },
];

const stepRoles = ['기안', '검토', '결재', '합의', '수신'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

// ─── Approval Stamp (결재란) ─────────────────────────────────────────────────

function ApprovalStamp({ step, isActive }: { step: ApprovalStep; isActive: boolean }) {
  return (
    <div className={cn(
      'border border-border rounded flex flex-col min-w-[72px] text-center overflow-hidden',
      isActive && step.status === '대기' && 'ring-2 ring-primary'
    )}>
      <div className="bg-muted/60 py-0.5 px-2">
        <p className="text-[10px] font-medium text-muted-foreground">{step.role}</p>
      </div>
      <div className="py-3 px-2 relative">
        <p className="text-xs font-semibold">{step.approverName}</p>
        {step.status === '승인' && (
          <div className="absolute inset-1 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-red-500 rounded-full w-8 h-8 flex items-center justify-center rotate-[-15deg] opacity-80">
              <span className="text-[9px] font-bold text-red-500">승인</span>
            </div>
          </div>
        )}
        {step.status === '반려' && (
          <div className="absolute inset-1 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-gray-500 rounded-full w-8 h-8 flex items-center justify-center rotate-[-15deg] opacity-80">
              <span className="text-[9px] font-bold text-gray-500">반려</span>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border py-1 px-2">
        <p className="text-[10px] text-muted-foreground">
          {step.actedAt ? new Date(step.actedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
        </p>
      </div>
    </div>
  );
}

// ─── Attachment Preview Modal ─────────────────────────────────────────────────

function AttachmentPreview({ att, onClose }: { att: Attachment; onClose: () => void }) {
  const isImg = att.mime_type.startsWith('image/');
  const isPdf = att.mime_type === 'application/pdf';
  const url = `/api/uploads/${att.filename}`;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = att.original_name;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-white text-sm font-medium truncate flex-1 mr-4">{att.original_name}</span>
        <div className="flex gap-2">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors">
            <Download className="w-3.5 h-3.5" />다운로드
          </button>
          <button onClick={onClose} className="text-white hover:text-gray-300 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={e => e.stopPropagation()}>
        {isImg ? (
          <img src={url} alt={att.original_name} className="max-w-full max-h-full object-contain rounded shadow-xl" />
        ) : isPdf ? (
          <iframe src={url} className="w-full h-full rounded" title={att.original_name} />
        ) : (
          <div className="text-center text-white">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-60" />
            <p className="text-sm mb-1">{att.original_name}</p>
            <p className="text-xs text-gray-400 mb-4">{formatFileSize(att.size)}</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 text-sm text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-md mx-auto transition-colors">
              <Download className="w-4 h-4" />파일 다운로드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function ApprovalDetail({ apr, myId, myName, onAction, onArchive, onReuse }: {
  apr: Approval; myId: string; myName: string; onAction: () => void; onArchive: () => void;
  onReuse: (apr: Approval, isResubmit: boolean) => void;
}) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const steps = parseSteps(apr);
  const myPendingStep = steps.find(s => s.approverId === myId && s.status === '대기');
  const prevDone = myPendingStep ? steps.filter(s => s.order < myPendingStep.order).every(s => s.status === '승인') : false;
  const canAct = !!myPendingStep && prevDone;

  const loadExtra = useCallback(async () => {
    const [atts, cmts] = await Promise.all([
      fetch(`/api/approvals/${apr.id}/attachments`).then(r => r.json()).catch(() => []),
      fetch(`/api/approvals/${apr.id}/comments`).then(r => r.json()).catch(() => []),
    ]);
    setAttachments(Array.isArray(atts) ? atts : []);
    setComments(Array.isArray(cmts) ? cmts : []);
  }, [apr.id]);

  useEffect(() => { loadExtra(); }, [loadExtra]);

  const act = async (action: 'approve' | 'reject') => {
    if (!myPendingStep) return;
    setLoading(true);
    await fetch(`/api/approvals/${apr.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepOrder: myPendingStep.order, action, comment: comment || null }),
    });
    setLoading(false);
    setComment('');
    onAction();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`/api/approvals/${apr.id}/attachments`, { method: 'POST', body: fd });
    await loadExtra();
    setUploading(false);
    e.target.value = '';
  };

  const handleDeleteAtt = async (attId: string) => {
    await fetch(`/api/approvals/${apr.id}/attachments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attId }),
    });
    await loadExtra();
  };

  const sendComment = async () => {
    if (!newComment.trim()) return;
    await fetch(`/api/approvals/${apr.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment }),
    });
    setNewComment('');
    await loadExtra();
  };

  const handlePrint = () => {
    const printContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <title>${apr.form_title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; color: #000; padding: 20mm; }
    .doc-title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 16px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .meta-table td { border: 1px solid #000; padding: 4px 8px; font-size: 11px; }
    .meta-table .label { background: #f0f0f0; font-weight: bold; width: 80px; }
    .stamp-row { display: flex; gap: 0; margin-bottom: 16px; }
    .stamp { border: 1px solid #000; min-width: 80px; text-align: center; }
    .stamp .role { background: #f0f0f0; font-size: 10px; padding: 3px; border-bottom: 1px solid #000; }
    .stamp .name { padding: 12px 6px; font-size: 12px; font-weight: bold; min-height: 48px; display: flex; align-items: center; justify-content: center; }
    .stamp .date { border-top: 1px solid #000; font-size: 10px; padding: 3px; color: #444; }
    .stamp.approved .name { color: red; }
    .stamp.rejected .name { color: #666; text-decoration: line-through; }
    .section-title { font-weight: bold; font-size: 11px; margin-bottom: 6px; border-bottom: 2px solid #000; padding-bottom: 3px; }
    .body-content { border: 1px solid #ccc; padding: 12px; min-height: 200px; margin-bottom: 16px; line-height: 1.6; }
    .body-content img { max-width: 100%; }
    .attachments { margin-bottom: 16px; }
    .att-item { padding: 3px 0; font-size: 11px; }
    @page { margin: 15mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="doc-title">${formTypes.find(f => f.id === apr.form_type)?.label ?? apr.form_type}</div>
  <table class="meta-table">
    <tr><td class="label">문서번호</td><td>${apr.business_id}</td><td class="label">작성일</td><td>${new Date(apr.created_at).toLocaleDateString('ko-KR')}</td></tr>
    <tr><td class="label">제목</td><td colspan="3">${apr.form_title}</td></tr>
    <tr><td class="label">기안자</td><td>${apr.requester_name}${apr.requester_dept ? ' (' + apr.requester_dept + ')' : ''}</td><td class="label">상태</td><td>${apr.status}</td></tr>
    ${apr.due_date ? `<tr><td class="label">마감일</td><td colspan="3">${apr.due_date}</td></tr>` : ''}
  </table>
  <div class="stamp-row">
    <div class="stamp"><div class="role">기안</div><div class="name">${apr.requester_name}</div><div class="date">${new Date(apr.created_at).toLocaleDateString('ko-KR')}</div></div>
    ${steps.map(s => `<div class="stamp ${s.status === '승인' ? 'approved' : s.status === '반려' ? 'rejected' : ''}"><div class="role">${s.role}</div><div class="name">${s.approverName}</div><div class="date">${s.actedAt ? new Date(s.actedAt).toLocaleDateString('ko-KR') : '-'}</div></div>`).join('')}
  </div>
  <p class="section-title">본문</p>
  <div class="body-content">${apr.body_html || `<p>${apr.description ?? ''}</p>`}</div>
  ${attachments.length > 0 ? `<p class="section-title">첨부파일</p><div class="attachments">${attachments.map(a => `<div class="att-item">📎 ${a.original_name} (${formatFileSize(a.size)})</div>`).join('')}</div>` : ''}
</body>
</html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(printContent); w.document.close(); w.focus(); w.print(); }
  };

  const handleSubmitDraft = async () => {
    await fetch(`/api/approvals/${apr.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    });
    onAction();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {previewAtt && <AttachmentPreview att={previewAtt} onClose={() => setPreviewAtt(null)} />}
      {/* Document header */}
      <div className="border-b border-border p-4">
        <div className="flex items-start gap-4">
          {/* Left: document info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[apr.status] ?? 'bg-gray-100 text-gray-600')}>
                {apr.status}
              </span>
              <span className={cn('text-xs font-medium', priorityStyle[apr.priority])}>{priorityLabel[apr.priority]}</span>
              {apr.due_date && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{apr.due_date}</span>}
            </div>
            <h2 className="text-base font-bold mt-1">{apr.form_title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {apr.business_id} · {apr.form_type} · {apr.requester_name}{apr.requester_dept ? ` (${apr.requester_dept})` : ''} · {new Date(apr.created_at).toLocaleDateString('ko-KR')}
            </p>
          </div>

          {/* Right: action buttons + 결재란 */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            {/* Action buttons */}
            <div className="flex gap-1.5 flex-wrap justify-end">
              {apr.status === '임시저장' && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSubmitDraft}>
                  <Send className="w-3 h-3" />기안 상신
                </Button>
              )}
              {apr.status === '반려' && myId === apr.requester_id && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-orange-400 text-orange-600 hover:bg-orange-50" onClick={() => onReuse(apr, true)}>
                  <RotateCcw className="w-3 h-3" />재기안
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" title="이 기안서를 양식으로 새 문서 작성" onClick={() => onReuse(apr, false)}>
                <Copy className="w-3.5 h-3.5" />불러오기
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handlePrint}>
                <Download className="w-3.5 h-3.5" />PDF
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="인쇄" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={apr.archived ? '보관 해제' : '보관'} onClick={onArchive}>
                {apr.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              </Button>
            </div>

            {/* 결재란 - 오른쪽 끝 배치 */}
            <div className="border border-border rounded overflow-hidden text-center">
              <div className="bg-muted/60 text-[10px] font-semibold py-0.5 px-3 border-b border-border truncate max-w-[320px]">
                {apr.form_title}
              </div>
              <div className="flex divide-x divide-border">
                {/* 기안자 */}
                <div className="flex flex-col min-w-[58px]">
                  <div className="bg-muted/40 text-[10px] py-0.5 border-b border-border">기안</div>
                  <div className="py-2.5 px-2 text-xs font-semibold min-h-[36px] flex items-center justify-center">
                    {apr.requester_name}
                  </div>
                  <div className="border-t border-border text-[10px] py-0.5 text-muted-foreground">
                    {new Date(apr.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </div>
                </div>
                {/* 결재자들 */}
                {steps.map((step, i) => (
                  <div key={i} className={cn(
                    'flex flex-col min-w-[58px]',
                    step.approverId === myId && step.status === '대기' && 'ring-2 ring-inset ring-primary'
                  )}>
                    <div className="bg-muted/40 text-[10px] py-0.5 border-b border-border">{step.role}</div>
                    <div className="py-2.5 px-2 text-xs font-semibold min-h-[36px] flex items-center justify-center relative">
                      {step.approverName}
                      {step.status === '승인' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="border-2 border-red-500 rounded-full w-7 h-7 flex items-center justify-center rotate-[-15deg] opacity-80">
                            <span className="text-[8px] font-bold text-red-500">승인</span>
                          </div>
                        </div>
                      )}
                      {step.status === '반려' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="border-2 border-gray-500 rounded-full w-7 h-7 flex items-center justify-center rotate-[-15deg] opacity-80">
                            <span className="text-[8px] font-bold text-gray-500">반려</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-border text-[10px] py-0.5 text-muted-foreground">
                      {step.actedAt ? new Date(step.actedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 결재자 의견 */}
            {steps.filter(s => s.comment).length > 0 && (
              <div className="text-right space-y-0.5">
                {steps.filter(s => s.comment).map((s, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground">
                    <span className="font-medium">{s.approverName}</span>: {s.comment}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-3xl">
        {/* Body */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">본문</p>
          {apr.body_html
            ? <div className="prose prose-sm max-w-none border border-border rounded-lg p-4 bg-background" dangerouslySetInnerHTML={{ __html: apr.body_html }} />
            : apr.description
              ? <div className="border border-border rounded-lg p-4 text-sm whitespace-pre-wrap">{apr.description}</div>
              : <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">내용 없음</div>
          }
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" />첨부파일 ({attachments.length})
            </p>
            <label className="cursor-pointer">
              <span className="text-xs text-primary hover:underline">{uploading ? '업로드 중...' : '+ 파일 추가'}</span>
              <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map(att => {
                const isImg = att.mime_type.startsWith('image/');
                const isPdf = att.mime_type === 'application/pdf';
                const url = `/api/uploads/${att.filename}`;
                return (
                  <div key={att.id} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-muted/40 group">
                    {/* Thumbnail */}
                    <div
                      className="w-10 h-10 rounded border border-border bg-muted/40 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden"
                      onClick={() => setPreviewAtt(att)}
                    >
                      {isImg
                        ? <img src={url} alt={att.original_name} className="w-full h-full object-cover" />
                        : isPdf
                          ? <span className="text-[10px] font-bold text-red-500">PDF</span>
                          : <FileText className="w-5 h-5 text-muted-foreground" />
                      }
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <button onClick={() => setPreviewAtt(att)}
                        className="text-xs font-medium text-primary hover:underline truncate block text-left">{att.original_name}</button>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</p>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPreviewAtt(att)} title="미리보기"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a href={url} download={att.original_name} title="다운로드"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {myId === apr.requester_id && apr.status !== '승인' && apr.status !== '반려' && (
                        <button onClick={() => handleDeleteAtt(att.id)} title="삭제"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Approve/Reject */}
        {canAct && (
          <div className="border border-primary/30 rounded-lg p-4 bg-primary/5">
            <p className="text-sm font-semibold mb-3 text-primary">결재 처리</p>
            <Input
              placeholder="의견 (선택사항)"
              value={comment}
              onChange={e => setComment(e.target.value)}
              className="mb-3 h-9"
            />
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1 gap-1.5" disabled={loading} onClick={() => act('reject')}>
                <XCircle className="w-4 h-4" />반려
              </Button>
              <Button className="flex-1 gap-1.5" disabled={loading} onClick={() => act('approve')}>
                <CheckCircle2 className="w-4 h-4" />승인
              </Button>
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" />댓글 ({comments.length})
          </p>
          <div className="space-y-2 mb-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{c.user_name[0]}</div>
                <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold">{c.user_name}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={`${myName}으로 댓글 달기...`}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              className="h-9"
            />
            <Button size="sm" className="h-9 px-3 shrink-0" onClick={sendComment}>전송</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface ApprovalTemplate {
  formType: string;
  formTitle: string;
  bodyHtml: string;
  description: string;
  priority: string;
  dueDate: string;
  dept: string;
  steps: Array<{ approverId: string; approverName: string; role: string }>;
}

function CreateModal({ users, myId, myName, onClose, onCreated, template }: {
  users: User[]; myId: string; myName: string; onClose: () => void; onCreated: (id: string) => void;
  template?: ApprovalTemplate;
}) {
  const [step, setStep] = useState<'type' | 'form'>(template ? 'form' : 'type');
  const [formType, setFormType] = useState(template?.formType ?? '');
  const [form, setForm] = useState({
    form_title: template?.formTitle ?? '',
    description: template?.description ?? '',
    body_html: template?.bodyHtml ?? '',
    priority: template?.priority ?? 'normal',
    due_date: template?.dueDate ?? '',
    requester_dept: template?.dept ?? '',
  });
  const [steps, setSteps] = useState<Array<{ approverId: string; approverName: string; role: string }>>(
    template?.steps?.length ? template.steps : [{ approverId: '', approverName: '', role: '결재' }]
  );
  const [related, setRelated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [relatedSearch, setRelatedSearch] = useState('');
  const [allApprovals, setAllApprovals] = useState<Approval[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    fetch('/api/approvals?tab=mine').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAllApprovals(d);
    }).catch(() => {});
  }, []);

  const selectType = (id: string) => { setFormType(id); setStep('form'); };

  const addStep = () => setSteps(s => [...s, { approverId: '', approverName: '', role: '결재' }]);
  const removeStep = (i: number) => setSteps(s => s.filter((_, j) => j !== i));
  const updateStep = (i: number, field: string, value: string) => {
    setSteps(s => s.map((st, j) => j === i ? { ...st, [field]: value } : st));
  };

  const handlePendingFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleSubmit = async (asDraft = false) => {
    if (!form.form_title.trim()) { alert('제목을 입력하세요.'); return; }
    const validSteps = steps.filter(s => s.approverId);
    if (!asDraft && validSteps.length === 0) { alert('결재자를 1명 이상 추가하세요.'); return; }
    setLoading(true);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_type: formType, ...form,
        steps: validSteps,
        related,
        draft: asDraft,
      }),
    }).then(r => r.json()).catch(() => ({}));

    if (res.id && pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await fetch(`/api/approvals/${res.id}/attachments`, { method: 'POST', body: fd }).catch(() => {});
      }
    }

    setLoading(false);
    if (res.id) onCreated(res.id);
  };

  const formTypeInfo = formTypes.find(f => f.id === formType);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button onClick={() => setStep('type')} className="text-muted-foreground hover:text-foreground">←</button>
            )}
            <h3 className="font-semibold">{step === 'type' ? '문서 유형 선택' : `기안서 작성`}</h3>
            {step === 'form' && formTypeInfo && (
              <span className={cn('text-xs text-white px-2 py-0.5 rounded-full', formTypeInfo.color)}>{formTypeInfo.label}</span>
            )}
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'type' ? (
            <div className="grid grid-cols-3 gap-3">
              {formTypes.map(ft => {
                const Icon = ft.icon;
                return (
                  <button key={ft.id} onClick={() => selectType(ft.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', ft.color)}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm font-medium">{ft.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">제목 *</label>
                  <Input className="mt-1 h-9" value={form.form_title} onChange={e => setForm(f => ({ ...f, form_title: e.target.value }))} placeholder="기안서 제목" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">부서</label>
                  <Input className="mt-1 h-9" value={form.requester_dept} onChange={e => setForm(f => ({ ...f, requester_dept: e.target.value }))} placeholder="소속 부서" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">마감일</label>
                  <Input type="date" className="mt-1 h-9" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">우선순위</label>
                  <select className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Rich text body */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">본문</label>
                <RichEditor content={form.body_html} onChange={html => setForm(f => ({ ...f, body_html: html }))} placeholder="기안 내용을 입력하세요..." />
              </div>

              {/* 결재 라인 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">결재 라인</label>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{i + 1}단계</span>
                      <select className="w-20 h-9 rounded-md border border-input bg-background px-2 text-xs shrink-0"
                        value={s.role} onChange={e => updateStep(i, 'role', e.target.value)}>
                        {stepRoles.map(r => <option key={r}>{r}</option>)}
                      </select>
                      <select className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={s.approverId}
                        onChange={e => {
                          const u = users.find(u => u.id === e.target.value);
                          updateStep(i, 'approverId', e.target.value);
                          updateStep(i, 'approverName', u?.name ?? '');
                        }}>
                        <option value="">결재자 선택</option>
                        {users.filter(u => u.id !== myId).map(u => (
                          <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
                        ))}
                      </select>
                      {steps.length > 1 && (
                        <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1" onClick={addStep}>
                    <Plus className="w-3 h-3" />결재자 추가
                  </Button>
                </div>
              </div>

              {/* 파일 첨부 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />파일 첨부
                </label>
                <label className="flex items-center gap-2 w-full cursor-pointer border border-dashed border-border rounded-lg px-3 py-2.5 hover:border-primary hover:bg-primary/5 transition-colors">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">파일 선택 (여러 개 가능)</span>
                  <input type="file" multiple className="hidden" onChange={handlePendingFile} />
                </label>
                {pendingFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/30">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                        <button type="button" onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 관련 문서 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" />관련 문서 연결
                </label>
                <Input
                  placeholder="문서 제목 검색..."
                  value={relatedSearch}
                  onChange={e => setRelatedSearch(e.target.value)}
                  className="h-8 mb-2"
                />
                {relatedSearch && (
                  <div className="border border-border rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                    {allApprovals.filter(a => a.form_title.toLowerCase().includes(relatedSearch.toLowerCase()) && !related.includes(a.id)).map(a => (
                      <button key={a.id} onClick={() => { setRelated(r => [...r, a.id]); setRelatedSearch(''); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b border-border last:border-0">
                        <span className="font-mono text-muted-foreground mr-2">{a.business_id}</span>{a.form_title}
                      </button>
                    ))}
                  </div>
                )}
                {related.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {related.map(relId => {
                      const a = allApprovals.find(x => x.id === relId);
                      return a ? (
                        <span key={relId} className="flex items-center gap-1 text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
                          {a.form_title}
                          <button onClick={() => setRelated(r => r.filter(x => x !== relId))}><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
            <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => handleSubmit(true)} disabled={loading}>
              <Pencil className="w-3.5 h-3.5" />임시저장
            </Button>
            <Button className="flex-1 gap-1.5" onClick={() => handleSubmit(false)} disabled={loading}>
              <Send className="w-3.5 h-3.5" />{loading ? (pendingFiles.length > 0 ? '파일 업로드 중...' : '기안 중...') : '기안 상신'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'mine', label: '내 결재함', icon: FileText },
  { key: 'pending', label: '결재 대기', icon: Clock },
  { key: 'done', label: '처리 완료', icon: CheckCircle2 },
  { key: 'archive', label: '보관함', icon: Archive },
];

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [list, setList] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createTemplate, setCreateTemplate] = useState<ApprovalTemplate | undefined>();
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const data = await fetch(`/api/approvals?tab=${tab}`).then(r => r.json()).catch(() => []);
    const items: Approval[] = Array.isArray(data) ? data.map((a: Approval) => ({ ...a, steps: parseSteps(a) })) : [];
    setList(items);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => {
      if (j.user) { setMyId(j.user.id); setMyName(j.user.name); }
    }).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
  }, []);

  const refreshSelected = async () => {
    await load();
    if (selected) {
      const data = await fetch(`/api/approvals?tab=${tab}`).then(r => r.json()).catch(() => []);
      const items: Approval[] = Array.isArray(data) ? data.map((a: Approval) => ({ ...a, steps: parseSteps(a) })) : [];
      const updated = items.find(a => a.id === selected.id);
      if (updated) setSelected(updated);
    }
  };

  const handleArchive = async (apr: Approval) => {
    await fetch(`/api/approvals/${apr.id}/archive`, { method: 'POST' });
    setSelected(null);
    await load();
  };

  const handleReuse = (apr: Approval, isResubmit: boolean) => {
    const steps = parseSteps(apr);
    setCreateTemplate({
      formType: apr.form_type,
      formTitle: isResubmit ? apr.form_title : `[참고] ${apr.form_title}`,
      bodyHtml: apr.body_html ?? '',
      description: apr.description ?? '',
      priority: apr.priority,
      dueDate: apr.due_date ?? '',
      dept: apr.requester_dept ?? '',
      steps: steps.map(s => ({ approverId: s.approverId, approverName: s.approverName, role: s.role })),
    });
    setShowCreate(true);
  };

  const filtered = list.filter(a =>
    a.form_title.toLowerCase().includes(search.toLowerCase()) ||
    a.requester_name.toLowerCase().includes(search.toLowerCase()) ||
    a.business_id.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = list.filter(a => {
    if (tab !== 'pending') return false;
    const steps = parseSteps(a);
    return steps.some(s => s.approverId === myId && s.status === '대기');
  }).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="결재" />

      {mobileDetail && selected && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="h-12 flex items-center px-4 border-b border-border shrink-0 gap-3">
            <button onClick={() => setMobileDetail(false)} className="text-sm text-primary flex items-center gap-1">
              ← 목록
            </button>
            <span className="font-semibold text-sm truncate flex-1">{selected.form_title}</span>
          </div>
          <ApprovalDetail apr={selected} myId={myId} myName={myName} onAction={refreshSelected} onArchive={() => handleArchive(selected)} onReuse={handleReuse} />
        </div>
      )}

      {showCreate && (
        <CreateModal
          users={users} myId={myId} myName={myName}
          template={createTemplate}
          onClose={() => { setShowCreate(false); setCreateTemplate(undefined); }}
          onCreated={async (id) => {
            setShowCreate(false);
            setCreateTemplate(undefined);
            setTab('mine');
            await load();
            const data = await fetch(`/api/approvals?tab=mine`).then(r => r.json()).catch(() => []);
            const items: Approval[] = Array.isArray(data) ? data.map((a: Approval) => ({ ...a, steps: parseSteps(a) })) : [];
            const created = items.find(a => a.id === id);
            if (created) setSelected(created);
          }}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); }}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors',
                    tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                  )}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search + New */}
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />새 기안서 작성
            </Button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                {tab === 'pending' ? '결재 대기 문서가 없습니다.' :
                 tab === 'done' ? '처리한 문서가 없습니다.' :
                 tab === 'archive' ? '보관된 문서가 없습니다.' : '기안한 문서가 없습니다.'}
              </div>
            )}
            {filtered.map(apr => {
              const steps = parseSteps(apr);
              const myStep = steps.find(s => s.approverId === myId && s.status === '대기');
              const ft = formTypes.find(f => f.id === apr.form_type);

              return (
                <button key={apr.id}
                  onClick={() => { setSelected(apr); setMobileDetail(true); }}
                  className={cn(
                    'w-full text-left p-3.5 hover:bg-muted/50 transition-colors border-b border-border last:border-0',
                    selected?.id === apr.id && 'bg-primary/5 border-l-2 border-l-primary'
                  )}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      {ft && (
                        <span className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0', ft.color)}>
                          <ft.icon className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground">{apr.business_id}</span>
                    </div>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', statusStyle[apr.status] ?? 'bg-gray-100 text-gray-600')}>
                      {apr.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium line-clamp-2 mb-1">{apr.form_title}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{apr.requester_name} · {new Date(apr.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</p>
                    {myStep && <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5">내 차례</span>}
                  </div>
                  {apr.due_date && (
                    <p className="text-[10px] text-orange-600 mt-0.5">마감 {apr.due_date}</p>
                  )}
                  {/* Step progress */}
                  <div className="flex gap-1 mt-2">
                    {steps.map((s, i) => (
                      <div key={i} className={cn('h-1 flex-1 rounded-full',
                        s.status === '승인' ? 'bg-green-500' :
                        s.status === '반려' ? 'bg-red-500' :
                        s.approverId === myId ? 'bg-primary' : 'bg-muted'
                      )} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 hidden md:flex overflow-hidden">
          {selected
            ? <ApprovalDetail apr={selected} myId={myId} myName={myName} onAction={refreshSelected} onArchive={() => handleArchive(selected)} onReuse={handleReuse} />
            : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <FileText className="w-12 h-12 opacity-20" />
                <p className="text-sm">문서를 선택하거나 새 기안서를 작성하세요.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" />새 기안서 작성
                </Button>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
