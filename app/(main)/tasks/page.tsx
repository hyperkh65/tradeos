'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Clock, X, Loader2, Link as LinkIcon, ChevronRight, Trash2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task } from '@/types';

const priorityStyle: Record<string, string> = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' };
const priorityLabel: Record<string, string> = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const statusStyle: Record<string, string> = { '해야 함': 'bg-gray-100 text-gray-700', '진행 중': 'bg-blue-100 text-blue-700', '대기': 'bg-yellow-100 text-yellow-700', '완료': 'bg-green-100 text-green-700' };
const statuses = ['해야 함', '진행 중', '대기', '완료'] as const;

const MODULE_LABELS: Record<string, string> = {
  quote: '견적', po: '발주', sale: '매출', shipment: '선적', claim: '클레임', inspection: '검품', cost: '비용원장', company: '거래처',
};
const MODULE_LINKS: Record<string, string> = {
  quote: '/quotes', po: '/purchase-orders', sale: '/sales', shipment: '/shipments', claim: '/claims', inspection: '/inspections', cost: '/accounting', company: '/companies',
};

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface TaskLink {
  id: string;
  task_id: string;
  module: string;
  record_id: string;
  record_label?: string;
  created_at: string;
}

interface ExtendedTask extends Task {
  assigneeId?: string;
  assigneeName?: string;
}

// ─── New Task Modal ─────────────────────────────────────────────────────────

function TaskCreateModal({ onClose, onSave }: { onClose: () => void; onSave: (t: ExtendedTask) => void }) {
  const [form, setForm] = useState({ title: '', priority: 'medium', status: '해야 함', dueDate: '', relatedName: '', assigneeName: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.data) onSave(json.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">새 업무</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">업무명 *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="업무 내용을 입력하세요" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">우선순위</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">마감일</label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">담당자</label>
              <Input value={form.assigneeName} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))} placeholder="이름 입력" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">관련 건</label>
            <Input value={form.relatedName} onChange={e => setForm(f => ({ ...f, relatedName: e.target.value }))} placeholder="PO-2026-0031 등" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────

interface ModuleRecord { id: string; businessId: string; label: string; sub: string; status?: string; date?: string; }

function TaskDetailModal({ task, onClose, onUpdate, onDelete }: { task: ExtendedTask; onClose: () => void; onUpdate: (t: ExtendedTask) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
    relatedName: task.relatedName || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [linkModule, setLinkModule] = useState('quote');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [tab, setTab] = useState<'detail' | 'comments' | 'links'>('detail');
  // 연결 - 모듈 레코드 검색
  const [moduleRecords, setModuleRecords] = useState<ModuleRecord[]>([]);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleQ, setModuleQ] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<ModuleRecord | null>(null);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/comments`);
    const json = await res.json();
    setComments(json.data || []);
  }, [task.id]);

  const loadLinks = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/links`);
    const json = await res.json();
    setLinks(json.data || []);
  }, [task.id]);

  const loadModuleRecords = useCallback(async (mod: string, q: string) => {
    setModuleLoading(true);
    setSelectedRecord(null);
    try {
      const res = await fetch(`/api/tasks/module-records?module=${mod}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setModuleRecords(json.data || []);
    } finally {
      setModuleLoading(false);
    }
  }, []);

  useEffect(() => { loadComments(); loadLinks(); }, [loadComments, loadLinks]);

  // 링크 폼 열릴 때 + 모듈 변경 시 자동 로드
  useEffect(() => {
    if (showLinkForm) loadModuleRecords(linkModule, moduleQ);
  }, [showLinkForm, linkModule]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.data) onUpdate({ ...task, ...json.data });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('이 업무를 삭제할까요?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDelete(task.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setCommentSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText }),
      });
      setCommentText('');
      loadComments();
    } finally {
      setCommentSaving(false);
    }
  };

  const handleAddLink = async (rec: ModuleRecord) => {
    await fetch(`/api/tasks/${task.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: linkModule, recordId: rec.businessId, recordLabel: rec.label }),
    });
    setShowLinkForm(false);
    setSelectedRecord(null);
    loadLinks();
  };

  const handleRemoveLink = async (linkId: string) => {
    await fetch(`/api/tasks/${task.id}/links?linkId=${linkId}`, { method: 'DELETE' });
    loadLinks();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={cn('bg-background rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col transition-all', tab === 'links' && showLinkForm ? 'max-w-4xl' : 'max-w-2xl')}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold truncate flex-1 mr-2">{task.title}</h2>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive p-1 rounded" title="삭제">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b px-4">
          {(['detail', 'comments', 'links'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('text-xs px-3 py-2.5 font-medium border-b-2 transition-colors', tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t === 'detail' ? '상세' : t === 'comments' ? `댓글 (${comments.length})` : `연결 (${links.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'detail' && (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">업무명</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">설명</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="업무 설명"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">우선순위</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as typeof f.priority }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="urgent">긴급</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof f.status }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">마감일</label>
                  <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">관련 건</label>
                  <Input value={form.relatedName} onChange={e => setForm(f => ({ ...f, relatedName: e.target.value }))} placeholder="PO-2026-0001 등" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="gap-1">
                  <Trash2 className="w-3.5 h-3.5" />삭제
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
                </Button>
              </div>
            </div>
          )}

          {tab === 'comments' && (
            <div className="p-4 space-y-3">
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">댓글이 없습니다.</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="bg-muted/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{c.user_name}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3">
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="댓글을 입력하세요. @이름 으로 멘션 가능합니다."
                />
                <div className="flex justify-end mt-2">
                  <Button size="sm" onClick={handleComment} disabled={commentSaving || !commentText.trim()}>
                    {commentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '등록'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'links' && (
            <div className="flex flex-col gap-0">
              {/* 기존 연결 목록 */}
              <div className="p-4 space-y-2">
                {links.length === 0 && !showLinkForm && (
                  <p className="text-sm text-muted-foreground text-center py-4">연결된 문서가 없습니다.</p>
                )}
                {links.map(lk => (
                  <div key={lk.id} className="flex items-center gap-2 p-2.5 border border-border rounded-lg">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">{MODULE_LABELS[lk.module] ?? lk.module}</span>
                    <span className="text-sm flex-1 truncate">{lk.record_label || lk.record_id}</span>
                    <a href={`${MODULE_LINKS[lk.module] ?? '/'}?id=${lk.record_id}`} className="text-primary shrink-0" target="_blank" rel="noopener noreferrer">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => handleRemoveLink(lk.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {!showLinkForm && (
                  <Button size="sm" variant="outline" className="w-full gap-1 mt-1" onClick={() => { setShowLinkForm(true); setModuleQ(''); }}>
                    <LinkIcon className="w-3.5 h-3.5" />모듈 연결
                  </Button>
                )}
              </div>

              {/* 문서 선택 패널 (3단: 모듈 | 목록 | 상세) */}
              {showLinkForm && (
                <div className="border-t border-border flex h-72">
                  {/* 모듈 선택 */}
                  <div className="w-28 shrink-0 border-r border-border flex flex-col">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 pt-2 pb-1">모듈</p>
                    {Object.entries(MODULE_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => { setLinkModule(k); setModuleQ(''); setSelectedRecord(null); }}
                        className={cn('text-left text-xs px-3 py-2 transition-colors', linkModule === k ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground')}
                      >
                        {v}
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button onClick={() => { setShowLinkForm(false); setSelectedRecord(null); }} className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 border-t border-border text-left">취소</button>
                  </div>

                  {/* 문서 목록 */}
                  <div className="w-52 shrink-0 border-r border-border flex flex-col">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <input
                          className="w-full h-7 pl-6 pr-2 text-xs rounded border border-input bg-background"
                          placeholder="검색..."
                          value={moduleQ}
                          onChange={e => { setModuleQ(e.target.value); loadModuleRecords(linkModule, e.target.value); }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {moduleLoading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
                      {!moduleLoading && moduleRecords.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">결과 없음</p>}
                      {moduleRecords.map(rec => (
                        <button
                          key={rec.id}
                          onClick={() => setSelectedRecord(rec)}
                          className={cn('w-full text-left px-3 py-2 border-b border-border/50 transition-colors', selectedRecord?.id === rec.id ? 'bg-primary/10' : 'hover:bg-muted/50')}
                        >
                          <p className="text-xs font-medium truncate">{rec.businessId}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{rec.sub}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 상세/내역 패널 */}
                  <div className="flex-1 flex flex-col">
                    {selectedRecord ? (
                      <>
                        <div className="p-3 border-b border-border">
                          <p className="text-xs font-semibold">{selectedRecord.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{selectedRecord.sub}</p>
                        </div>
                        <div className="p-3 flex-1 space-y-2">
                          {selectedRecord.status && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-12">상태</span>
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{selectedRecord.status}</span>
                            </div>
                          )}
                          {selectedRecord.date && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-12">날짜</span>
                              <span className="text-xs">{selectedRecord.date}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-12">ID</span>
                            <span className="text-xs font-mono">{selectedRecord.businessId}</span>
                          </div>
                          <a
                            href={`${MODULE_LINKS[linkModule] ?? '/'}?id=${selectedRecord.businessId}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                          >
                            <ChevronRight className="w-3 h-3" />전체 보기
                          </a>
                        </div>
                        <div className="p-3 border-t border-border">
                          <Button size="sm" className="w-full" onClick={() => handleAddLink(selectedRecord)}>
                            이 문서 연결
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">문서를 선택하면 내역이 표시됩니다</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<ExtendedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ExtendedTask | null>(null);
  const [teamMode, setTeamMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const load = useCallback(async (team: boolean) => {
    setLoading(true);
    try {
      const url = team ? '/api/tasks?assignee=all' : '/api/tasks';
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) setTasks(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(teamMode); }, [teamMode, load]);

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    return true;
  });

  const byStatus = (s: string) => filteredTasks.filter(t => t.status === s);

  const handleStatusChange = async (task: ExtendedTask, newStatus: ExtendedTask['status']) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleUpdate = (updated: ExtendedTask) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    setSelectedTask(updated);
  };

  const handleDelete = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTask(null);
  };

  const handleDeleteFromCard = async (e: React.MouseEvent, task: ExtendedTask) => {
    e.stopPropagation();
    if (!confirm('이 업무를 삭제할까요?')) return;
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== task.id));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="내 업무" />
      {showModal && (
        <TaskCreateModal
          onClose={() => setShowModal(false)}
          onSave={t => { setTasks(prev => [t, ...prev]); setShowModal(false); }}
        />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 필터 패널 */}
        <div className="hidden md:flex flex-col w-48 shrink-0 border-r border-border p-3 gap-3 overflow-y-auto">
          {/* 내 업무 / 팀 전체 */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">보기</p>
            <div className="space-y-1">
              <button
                onClick={() => setTeamMode(false)}
                className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors', !teamMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground')}
              >
                내 업무
              </button>
              <button
                onClick={() => setTeamMode(true)}
                className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors', teamMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground')}
              >
                팀 전체
              </button>
            </div>
          </div>

          {/* 상태 필터 */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">상태</p>
            <div className="space-y-1">
              {[{ v: 'all', l: '전체' }, { v: '진행 중', l: '진행중' }, { v: '완료', l: '완료' }, { v: '대기', l: '보류' }].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setStatusFilter(v)}
                  className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors', statusFilter === v ? 'bg-muted font-semibold' : 'hover:bg-muted text-muted-foreground')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 우선순위 필터 */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">우선순위</p>
            <div className="space-y-1">
              {[{ v: 'all', l: '전체' }, { v: 'urgent', l: '긴급' }, { v: 'high', l: '높음' }, { v: 'medium', l: '보통' }, { v: 'low', l: '낮음' }].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setPriorityFilter(v)}
                  className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors', priorityFilter === v ? 'bg-muted font-semibold' : 'hover:bg-muted text-muted-foreground')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 우측 업무 목록 */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              <button onClick={() => setView('kanban')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>칸반</button>
              <button onClick={() => setView('list')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>목록</button>
              {/* 모바일 팀/내 업무 토글 */}
              <button onClick={() => setTeamMode(p => !p)} className={cn('md:hidden text-xs px-2.5 py-1 rounded-md transition-colors', teamMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                {teamMode ? '팀 전체' : '내 업무'}
              </button>
            </div>
            <Button size="sm" className="h-8 gap-1" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /><span className="hidden sm:inline">새 업무</span></Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : view === 'kanban' ? (
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-3 h-full min-w-max pb-2">
                {statuses.map(status => (
                  <div key={status} className="w-64 flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{status}</span>
                      <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', statusStyle[status])}>{byStatus(status).length}</span>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                      {byStatus(status).map(task => (
                        <div
                          key={task.id}
                          className="bg-card border border-border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all group"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', priorityStyle[task.priority])}>{priorityLabel[task.priority]}</span>
                            <div className="flex items-center gap-1">
                              {task.dueDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{String(task.dueDate).slice(5, 10)}</span>}
                              <button
                                onClick={e => handleDeleteFromCard(e, task)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                title="삭제"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-medium leading-tight">{task.title}</p>
                          {task.assigneeName && <p className="text-[11px] text-blue-600 mt-1">담당: {task.assigneeName}</p>}
                          {task.relatedName && <p className="text-xs text-muted-foreground mt-1 truncate">{task.relatedName}</p>}
                          <div className="mt-2 flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                            {statuses.filter(s => s !== status).map(s => (
                              <button key={s} onClick={() => handleStatusChange(task, s as ExtendedTask['status'])} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors">→ {s}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>{['우선순위', '업무명', '담당자', '상태', '마감일', '관련', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTasks.map(t => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors cursor-pointer group" onClick={() => setSelectedTask(t)}>
                        <td className="px-4 py-3"><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', priorityStyle[t.priority])}>{priorityLabel[t.priority]}</span></td>
                        <td className="px-4 py-3 font-medium">{t.title}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{t.assigneeName || t.ownerName || '-'}</td>
                        <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyle[t.status])}>{t.status}</span></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{t.dueDate ? String(t.dueDate).slice(0, 10) : '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{t.relatedName ?? '-'}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={e => handleDeleteFromCard(e, t)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" title="삭제">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTasks.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />업무가 없습니다.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
