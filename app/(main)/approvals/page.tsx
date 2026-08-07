'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

interface ApprovalStep {
  order: number;
  approverId: string;
  approverName: string;
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
  steps: ApprovalStep[];
  steps_json?: string;
  current_step: number;
  status: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  name: string;
  department?: string;
}

const statusStyle: Record<string, string> = {
  '대기': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-100 text-blue-700',
  '승인': 'bg-green-100 text-green-700',
  '반려': 'bg-red-100 text-red-700',
};

function parseSteps(apr: Approval): ApprovalStep[] {
  if (Array.isArray(apr.steps)) return apr.steps;
  try { return JSON.parse(apr.steps_json ?? '[]'); } catch { return []; }
}

function Detail({
  apr,
  myId,
  onAction,
}: {
  apr: Approval;
  myId: string;
  onAction: () => void;
}) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const steps = parseSteps(apr);

  const myStep = steps.find(s => s.approverId === myId && s.status === '대기');

  const act = async (action: 'approve' | 'reject') => {
    if (!myStep) return;
    setLoading(true);
    await fetch(`/api/approvals/${apr.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepOrder: myStep.order, action, comment: comment || null }),
    });
    setLoading(false);
    setComment('');
    onAction();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{apr.business_id}</p>
            <h2 className="text-lg font-bold mt-1">{apr.form_title}</h2>
            <p className="text-sm text-muted-foreground">
              {apr.form_type} · {apr.requester_name} · {new Date(apr.created_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
          <span className={cn('text-sm font-semibold px-3 py-1 rounded-full shrink-0', statusStyle[apr.status] ?? 'bg-gray-100 text-gray-600')}>
            {apr.status}
          </span>
        </div>

        {apr.description && (
          <div className="bg-muted/40 rounded-lg p-3 mb-5 text-sm text-foreground whitespace-pre-wrap">{apr.description}</div>
        )}

        <h3 className="text-sm font-semibold mb-3">결재 라인</h3>
        <div className="flex gap-3 mb-6 flex-wrap">
          {steps.map((step, i) => (
            <div key={i} className="flex-1 min-w-[120px] border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                {step.status === '승인'
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : step.status === '반려'
                  ? <XCircle className="w-4 h-4 text-red-600" />
                  : <Clock className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs font-medium">{step.approverName}</span>
              </div>
              <p className={cn('text-xs',
                step.status === '승인' ? 'text-green-700' :
                step.status === '반려' ? 'text-red-700' : 'text-muted-foreground'
              )}>{step.status}</p>
              {step.comment && <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{step.comment}&rdquo;</p>}
              {step.actedAt && <p className="text-[11px] text-muted-foreground mt-1">{new Date(step.actedAt).toLocaleDateString('ko-KR')}</p>}
            </div>
          ))}
        </div>

        {myStep && (
          <div className="space-y-2">
            <Input
              placeholder="의견 (선택사항)"
              value={comment}
              onChange={e => setComment(e.target.value)}
              className="h-9"
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={loading} onClick={() => act('reject')}>반려</Button>
              <Button size="sm" disabled={loading} onClick={() => act('approve')}>승인</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [list, setList] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState('');

  const [form, setForm] = useState({
    form_type: '일반',
    form_title: '',
    description: '',
    steps: [{ approverId: '', approverName: '' }],
  });

  const load = useCallback(async () => {
    const [aprRes, meRes] = await Promise.all([
      fetch('/api/approvals').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]);
    const aprs: Approval[] = Array.isArray(aprRes) ? aprRes : [];
    const parsed = aprs.map(a => ({ ...a, steps: parseSteps(a) }));
    setList(parsed);
    if (parsed.length > 0 && !selected) setSelected(parsed[0]);
    if (meRes.user) setMyId(meRes.user.id);
  }, [selected]);

  useEffect(() => {
    load();
    fetch('/api/admin/users').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d);
    }).catch(() => {});
  }, []);

  const refreshSelected = async () => {
    const aprs = await fetch('/api/approvals').then(r => r.json());
    const parsed: Approval[] = (Array.isArray(aprs) ? aprs : []).map((a: Approval) => ({ ...a, steps: parseSteps(a) }));
    setList(parsed);
    if (selected) {
      const updated = parsed.find(a => a.id === selected.id);
      if (updated) setSelected(updated);
    }
  };

  const handleCreate = async () => {
    if (!form.form_title.trim()) return;
    const steps = form.steps
      .filter(s => s.approverId)
      .map((s, i) => ({ order: i + 1, approverId: s.approverId, approverName: s.approverName, status: '대기', comment: null, actedAt: null }));
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_type: form.form_type, form_title: form.form_title, description: form.description, steps }),
    });
    setShowCreate(false);
    setForm({ form_type: '일반', form_title: '', description: '', steps: [{ approverId: '', approverName: '' }] });
    await refreshSelected();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="결재" />

      {mobileDetail && selected && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="h-12 flex items-center px-4 border-b border-border shrink-0 gap-3">
            <button onClick={() => setMobileDetail(false)} className="text-sm text-primary">← 목록</button>
            <span className="font-semibold text-sm truncate">{selected.form_title}</span>
          </div>
          <Detail apr={selected} myId={myId} onAction={refreshSelected} />
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold">기안서 작성</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">문서 유형</label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.form_type}
                  onChange={e => setForm(f => ({ ...f, form_type: e.target.value }))}
                >
                  {['일반', '지출', '휴가', '출장', '구매'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">제목</label>
                <Input className="mt-1 h-9" value={form.form_title} onChange={e => setForm(f => ({ ...f, form_title: e.target.value }))} placeholder="기안서 제목" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">내용</label>
                <textarea
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="기안 내용"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">결재 라인</label>
                <div className="space-y-2 mt-1">
                  {form.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">{i + 1}차 결재</span>
                      <select
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={step.approverId}
                        onChange={e => {
                          const u = users.find(u => u.id === e.target.value);
                          setForm(f => {
                            const steps = [...f.steps];
                            steps[i] = { approverId: e.target.value, approverName: u?.name ?? '' };
                            return { ...f, steps };
                          });
                        }}
                      >
                        <option value="">결재자 선택</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>)}
                      </select>
                      {form.steps.length > 1 && (
                        <button onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setForm(f => ({ ...f, steps: [...f.steps, { approverId: '', approverName: '' }] }))}>
                    결재자 추가
                  </Button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>취소</Button>
              <Button className="flex-1" onClick={handleCreate}>기안</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border overflow-y-auto">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">결재 목록</span>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />기안
            </Button>
          </div>
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">결재 내역이 없습니다.</p>
          )}
          {list.map(apr => (
            <button
              key={apr.id}
              onClick={() => { setSelected(apr); setMobileDetail(true); }}
              className={cn(
                'w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0',
                selected?.id === apr.id && 'bg-primary/5 border-l-2 border-l-primary'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-mono text-muted-foreground">{apr.business_id}</span>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0', statusStyle[apr.status] ?? 'bg-gray-100 text-gray-600')}>
                  {apr.status}
                </span>
              </div>
              <p className="text-sm font-medium mt-1 line-clamp-2">{apr.form_title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {apr.form_type} · {apr.requester_name} · {new Date(apr.created_at).toLocaleDateString('ko-KR')}
              </p>
            </button>
          ))}
        </div>

        <div className="flex-1 hidden md:flex overflow-hidden">
          {selected
            ? <Detail apr={selected} myId={myId} onAction={refreshSelected} />
            : <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">결재를 선택하세요</div>
          }
        </div>
      </div>
    </div>
  );
}
