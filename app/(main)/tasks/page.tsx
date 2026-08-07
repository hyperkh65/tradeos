'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Clock, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Task } from '@/types';

const priorityStyle: Record<string, string> = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' };
const priorityLabel: Record<string, string> = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const statusStyle: Record<string, string> = { '해야 함': 'bg-gray-100 text-gray-700', '진행 중': 'bg-blue-100 text-blue-700', '대기': 'bg-yellow-100 text-yellow-700', '완료': 'bg-green-100 text-green-700' };
const statuses = ['해야 함', '진행 중', '대기', '완료'] as const;

function TaskModal({ onClose, onSave }: { onClose: () => void; onSave: (t: Task) => void }) {
  const [form, setForm] = useState({ title: '', priority: 'medium', status: '해야 함', dueDate: '', relatedName: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">마감일</label>
            <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(j => { if (j.data) setTasks(j.data); }).finally(() => setLoading(false));
  }, []);

  const byStatus = (s: string) => tasks.filter(t => t.status === s);

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await fetch(`/api/tasks/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="내 업무" />
      {showModal && <TaskModal onClose={() => setShowModal(false)} onSave={t => { setTasks(prev => [t, ...prev]); setShowModal(false); }} />}

      <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            <button onClick={() => setView('kanban')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>칸반</button>
            <button onClick={() => setView('list')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>목록</button>
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
                      <div key={task.id} className="bg-card border border-border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', priorityStyle[task.priority])}>{priorityLabel[task.priority]}</span>
                          {task.dueDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{String(task.dueDate).slice(5, 10)}</span>}
                        </div>
                        <p className="text-sm font-medium leading-tight">{task.title}</p>
                        {task.relatedName && <p className="text-xs text-muted-foreground mt-1 truncate">{task.relatedName}</p>}
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {statuses.filter(s => s !== status).map(s => (
                            <button key={s} onClick={() => handleStatusChange(task, s as Task['status'])} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors">→ {s}</button>
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
                  <tr>{['우선순위', '업무명', '상태', '마감일', '관련'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3"><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', priorityStyle[t.priority])}>{priorityLabel[t.priority]}</span></td>
                      <td className="px-4 py-3 font-medium">{t.title}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyle[t.status])}>{t.status}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.dueDate ? String(t.dueDate).slice(0, 10) : '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{t.relatedName ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tasks.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />업무가 없습니다.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
