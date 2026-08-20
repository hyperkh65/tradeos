'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  UserCog, Plus, Search, X, Pencil, Trash2, Loader2,
  Phone, Mail, CalendarDays, ClipboardList, Settings2,
  CheckCircle2, XCircle, Clock, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HRRecord {
  id: string; name: string; nameEn?: string;
  department: string; position: string; joinDate?: string;
  phone?: string; email?: string; status: string;
  salary?: number; memo?: string; createdAt: string;
}

interface LeaveRequest {
  id: string; businessId: string;
  userId: string; userName: string;
  leaveType: string; startDate: string; endDate: string;
  days: number; reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId?: string; approverName?: string;
  approvedAt?: string; rejectReason?: string;
  createdAt: string; updatedAt: string;
}

interface LeavePolicy {
  userId: string; userName: string;
  annualDays: number; usedDays: number; remainingDays: number;
  year: number;
  teamPolicies?: { userId: string; userName: string; annualDays: number; usedDays: number; remainingDays: number; policyId: string | null }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEPARTMENTS = ['경영', '영업', '무역', '물류', '회계', '관리', '기타'];
const POSITIONS = ['대표', '이사', '부장', '차장', '과장', '대리', '사원', '인턴'];

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: 'annual', label: '연차' },
  { value: 'sick', label: '병가' },
  { value: 'half_am', label: '반차(오전)' },
  { value: 'half_pm', label: '반차(오후)' },
  { value: 'special', label: '특별휴가' },
];

const statusStyle: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  leave: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  resigned: 'bg-gray-100 text-gray-500 border-gray-200',
};
const statusLabel: Record<string, string> = { active: '재직', leave: '휴직', resigned: '퇴직' };

const leaveStatusStyle: Record<string, string> = {
  pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};
const leaveStatusLabel: Record<string, string> = {
  pending: '대기', approved: '승인', rejected: '반려', cancelled: '취소',
};
const leaveStatusIcon: Record<string, React.ReactNode> = {
  pending:   <Clock className="w-3 h-3" />,
  approved:  <CheckCircle2 className="w-3 h-3" />,
  rejected:  <XCircle className="w-3 h-3" />,
  cancelled: <Ban className="w-3 h-3" />,
};

// ─── HR Modal ───────────────────────────────────────────────────────────────

function HRModal({ item, onClose, onSave }: { item?: HRRecord | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '', nameEn: item?.nameEn || '',
    department: item?.department || '무역', position: item?.position || '사원',
    joinDate: item?.joinDate || '', phone: item?.phone || '',
    email: item?.email || '', status: (item?.status || 'active') as string,
    salary: item?.salary?.toString() || '', memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const body = { ...form, salary: form.salary ? Number(form.salary) : undefined };
      if (item) {
        await fetch(`/api/hr/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '직원 수정' : '직원 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">이름 *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">영문명</label>
              <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Kim Hyun" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">부서</label>
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">직위</label>
              <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">입사일</label>
              <Input type="date" value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="active">재직</option>
                <option value="leave">휴직</option>
                <option value="resigned">퇴직</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">연락처</label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">이메일</label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">급여 (월, 원)</label>
            <Input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder="3000000" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">메모</label>
            <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="비고" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Annual Summary Card ─────────────────────────────────────────────────────

function AnnualSummaryCard({ policy }: { policy: LeavePolicy | null }) {
  if (!policy) return null;
  const pct = policy.annualDays > 0 ? (policy.usedDays / policy.annualDays) * 100 : 0;
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (pct / 100);

  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width="100" height="100" className="-rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="text-primary transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-90">
          <span className="text-lg font-bold">{policy.remainingDays}</span>
          <span className="text-[10px] text-muted-foreground">잔여</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">총 연차</span>
          <span className="font-medium">{policy.annualDays}일</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">사용</span>
          <span className="font-medium text-orange-600">{policy.usedDays}일</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">잔여</span>
          <span className="font-medium text-green-600">{policy.remainingDays}일</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Month Timeline ──────────────────────────────────────────────────────────

function MonthTimeline({ leaves }: { leaves: LeaveRequest[] }) {
  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  const monthLeaves = (m: number) => leaves.filter(l => {
    const s = new Date(l.startDate);
    const e = new Date(l.endDate);
    return (s.getFullYear() === year && s.getMonth() === m) ||
      (e.getFullYear() === year && e.getMonth() === m);
  });
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const leaveTypeLabel: Record<string, string> = {
    annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
  };

  return (
    <div className="bg-card border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">올해 휴가 타임라인</h3>
      <div className="grid grid-cols-6 gap-2">
        {months.map(m => {
          const ml = monthLeaves(m);
          return (
            <div key={m} className="min-h-12">
              <p className="text-[10px] text-muted-foreground mb-1">{monthNames[m]}</p>
              {ml.length === 0 ? (
                <div className="h-6 rounded bg-muted/30" />
              ) : ml.map(l => (
                <div key={l.id} className={cn(
                  'text-[9px] px-1 py-0.5 rounded mb-0.5 truncate',
                  l.status === 'approved' ? 'bg-green-100 text-green-800' :
                  l.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-500'
                )}>
                  {leaveTypeLabel[l.leaveType] ?? l.leaveType} {l.days}일
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Leave Request Form ──────────────────────────────────────────────────────

function calcBusinessDays(start: string, end: string, isHalf: boolean): number {
  if (isHalf) return 0.5;
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function LeaveForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [form, setForm] = useState({
    leaveType: 'annual', startDate: '', endDate: '', reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const isHalf = form.leaveType === 'half_am' || form.leaveType === 'half_pm';
  const days = calcBusinessDays(form.startDate, form.endDate, isHalf);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) { setMsg('날짜를 입력하세요.'); return; }
    if (days <= 0) { setMsg('유효한 영업일 범위를 선택하세요.'); return; }
    setSubmitting(true);
    setMsg('');
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, days }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(json.error ?? '오류가 발생했습니다.'); return; }
      setMsg('결재 상신이 완료되었습니다.');
      setForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
      onSubmitted();
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold">휴가 신청</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">휴가 유형</label>
          <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md w-full text-center">
            {days > 0 ? <><span className="text-base font-bold text-primary">{days}</span> 영업일</> : '날짜 선택 후 자동 계산'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
          <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: isHalf ? e.target.value : f.endDate }))} required />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">종료일</label>
          <Input type="date" value={form.endDate} min={form.startDate}
            disabled={isHalf}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">사유</label>
        <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="휴가 사유를 입력하세요" />
      </div>
      {msg && (
        <p className={cn('text-xs', msg.includes('완료') ? 'text-green-600' : 'text-red-500')}>{msg}</p>
      )}
      <Button type="submit" className="w-full" disabled={submitting || days <= 0}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
        결재 상신
      </Button>
    </form>
  );
}

// ─── Team Calendar ───────────────────────────────────────────────────────────

function TeamCalendar({ leaves }: { leaves: LeaveRequest[] }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const approvedLeaves = leaves.filter(l => l.status === 'approved');
  const leaveTypeLabel: Record<string, string> = {
    annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
  };

  const getDayLeaves = (day: number) => {
    const date = new Date(year, month, day);
    return approvedLeaves.filter(l => {
      const s = new Date(l.startDate);
      const e = new Date(l.endDate);
      return date >= s && date <= e;
    });
  };

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">팀 휴가 캘린더</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewDate(new Date(year, month - 1))} className="p-1 rounded hover:bg-muted text-muted-foreground text-sm">&lt;</button>
          <span className="text-sm font-medium">{year}년 {monthNames[month]}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1))} className="p-1 rounded hover:bg-muted text-muted-foreground text-sm">&gt;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground mb-1">
        {['일','월','화','수','목','금','토'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dl = getDayLeaves(day);
          const isWeekend = [0, 6].includes(new Date(year, month, day).getDay());
          return (
            <div key={day} className={cn(
              'min-h-8 rounded p-0.5 text-center',
              isWeekend ? 'bg-muted/30' : 'hover:bg-muted/50',
              dl.length > 0 && 'bg-green-50'
            )}>
              <p className={cn('text-[10px] leading-none mb-0.5', isWeekend && 'text-muted-foreground')}>{day}</p>
              {dl.slice(0, 2).map(l => (
                <div key={l.id} className="text-[8px] bg-green-200 text-green-800 rounded px-0.5 truncate mb-0.5">
                  {l.userName} {leaveTypeLabel[l.leaveType] ?? l.leaveType}
                </div>
              ))}
              {dl.length > 2 && <div className="text-[8px] text-muted-foreground">+{dl.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Admin Panel ─────────────────────────────────────────────────────────────

function AdminPanel({ policy, onPolicyUpdated }: { policy: LeavePolicy | null; onPolicyUpdated: () => void }) {
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ id: string; open: boolean }>({ id: '', open: false });
  const [rejectReason, setRejectReason] = useState('');
  const [policyEdit, setPolicyEdit] = useState<{ userId: string; days: string } | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingLeaves(true);
    const res = await fetch(`/api/leaves?year=${new Date().getFullYear()}`).then(r => r.json());
    const all = Array.isArray(res.data) ? res.data : [];
    setPendingLeaves(all.filter((l: LeaveRequest) => l.status === 'pending'));
    setLoadingLeaves(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleApprove = async (id: string) => {
    await fetch(`/api/leaves/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
    loadPending();
    onPolicyUpdated();
  };

  const handleReject = async () => {
    await fetch(`/api/leaves/${rejectModal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', rejectReason }) });
    setRejectModal({ id: '', open: false });
    setRejectReason('');
    loadPending();
  };

  const handlePolicyUpdate = async () => {
    if (!policyEdit) return;
    await fetch('/api/leaves/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: policyEdit.userId, annualDays: Number(policyEdit.days) }) });
    setPolicyEdit(null);
    onPolicyUpdated();
  };

  const leaveTypeLabel: Record<string, string> = {
    annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
  };

  return (
    <div className="space-y-6">
      {/* 팀원별 연차 설정 */}
      {policy?.teamPolicies && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">팀원별 연차 설정</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">이름</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">총 연차</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">사용</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">잔여</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {policy.teamPolicies.map(tp => (
                <tr key={tp.userId} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{tp.userName}</td>
                  <td className="px-4 py-2 text-center">
                    {policyEdit?.userId === tp.userId ? (
                      <Input type="number" value={policyEdit.days} onChange={e => setPolicyEdit(p => p ? ({ ...p, days: e.target.value }) : p)}
                        className="h-7 w-16 text-center mx-auto" />
                    ) : `${tp.annualDays}일`}
                  </td>
                  <td className="px-4 py-2 text-center text-orange-600">{tp.usedDays}일</td>
                  <td className="px-4 py-2 text-center text-green-600">{tp.remainingDays}일</td>
                  <td className="px-4 py-2 text-right">
                    {policyEdit?.userId === tp.userId ? (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" className="h-7 text-xs" onClick={handlePolicyUpdate}>저장</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPolicyEdit(null)}>취소</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setPolicyEdit({ userId: tp.userId, days: String(tp.annualDays) })}>
                        <Pencil className="w-3 h-3 mr-1" /> 수정
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 대기 중인 승인 요청 */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">대기 중인 승인 요청</h3>
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{pendingLeaves.length}건</span>
        </div>
        {loadingLeaves ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : pendingLeaves.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">대기 중인 요청이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">신청자</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">유형</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">기간</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">일수</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">사유</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pendingLeaves.map(l => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{l.userName}</td>
                  <td className="px-4 py-3">{leaveTypeLabel[l.leaveType] ?? l.leaveType}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.startDate} ~ {l.endDate}</td>
                  <td className="px-4 py-3 text-center">{l.days}일</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-32 truncate">{l.reason || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleApprove(l.id)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> 승인
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200" onClick={() => setRejectModal({ id: l.id, open: true })}>
                        <XCircle className="w-3 h-3 mr-1" /> 반려
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 반려 사유 모달 */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold">반려 사유 입력</h3>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="반려 사유를 입력하세요" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setRejectModal({ id: '', open: false }); setRejectReason(''); }}>취소</Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600" onClick={handleReject}>반려 확정</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type Tab = 'employees' | 'leave-request' | 'leave-status' | 'leave-admin';

export default function HRPage() {
  const [tab, setTab] = useState<Tab>('employees');

  // Employee state
  const [records, setRecords] = useState<HRRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: HRRecord | null }>({ open: false });

  // Leave state
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);

  const loadRecords = async () => {
    setLoadingRecords(true);
    const res = await fetch('/api/hr').then(r => r.json());
    setRecords(Array.isArray(res.data) ? res.data : []);
    setLoadingRecords(false);
  };

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const [leavesRes, policyRes] = await Promise.all([
        fetch(`/api/leaves?year=${new Date().getFullYear()}`).then(r => r.json()),
        fetch('/api/leaves/policy').then(r => r.json()),
      ]);
      setLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);
      if (policyRes.data) {
        setPolicy(policyRes.data);
        setIsAdmin(!!policyRes.data.teamPolicies);
      }
      // admin: load all leaves for team calendar
      if (policyRes.data?.teamPolicies) {
        const allRes = await fetch(`/api/leaves?year=${new Date().getFullYear()}`).then(r => r.json());
        setAllLeaves(Array.isArray(allRes.data) ? allRes.data : []);
      } else {
        setAllLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);
      }
    } finally {
      setLoadingLeaves(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, []);
  useEffect(() => { loadLeaves(); }, [loadLeaves]);

  const handleDelete = async (id: string) => {
    if (!confirm('직원 정보를 삭제하시겠습니까?')) return;
    await fetch(`/api/hr/${id}`, { method: 'DELETE' });
    loadRecords();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('휴가 신청을 취소하시겠습니까?')) return;
    await fetch(`/api/leaves/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
    loadLeaves();
  };

  const depts = ['전체', ...DEPARTMENTS.filter(d => records.some(r => r.department === d))];
  const filtered = records.filter(r => {
    const ms = r.name.includes(search) || (r.nameEn ?? '').includes(search) || (r.position ?? '').includes(search);
    const md = deptFilter === '전체' || r.department === deptFilter;
    return ms && md;
  });
  const activeCount = records.filter(r => r.status === 'active').length;

  const leaveTypeLabel: Record<string, string> = {
    annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'employees', label: '직원 관리', icon: <UserCog className="w-4 h-4" /> },
    { id: 'leave-request', label: '휴가 신청', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'leave-status', label: '휴가 현황', icon: <ClipboardList className="w-4 h-4" /> },
    ...(isAdmin ? [{ id: 'leave-admin' as Tab, label: '연차 관리', icon: <Settings2 className="w-4 h-4" /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="인사 관리 (HR)" icon={<UserCog className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">

        {/* Tab navigation */}
        <div className="flex gap-1 border-b">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ─── Tab: 직원 관리 ─── */}
        {tab === 'employees' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">전체 직원</p>
                <p className="text-xl font-bold mt-1">{records.length}<span className="text-sm font-normal text-muted-foreground ml-1">명</span></p>
              </div>
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">재직</p>
                <p className="text-xl font-bold text-green-600 mt-1">{activeCount}<span className="text-sm font-normal text-muted-foreground ml-1">명</span></p>
              </div>
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">부서 수</p>
                <p className="text-xl font-bold mt-1">{new Set(records.map(r => r.department)).size}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="이름, 직위 검색..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1 flex-wrap">
                {depts.map(d => (
                  <button key={d} onClick={() => setDeptFilter(d)}
                    className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                      deptFilter === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                    {d}
                  </button>
                ))}
              </div>
              <Button onClick={() => setModal({ open: true, item: null })}>
                <Plus className="w-4 h-4 mr-1" /> 직원 등록
              </Button>
            </div>
            {loadingRecords ? (
              <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">이름</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">부서</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">직위</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">입사일</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">연락처</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">상태</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">직원 데이터가 없습니다.</td></tr>
                    ) : filtered.map(r => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3"><p className="font-medium">{r.name}</p>{r.nameEn && <p className="text-xs text-muted-foreground">{r.nameEn}</p>}</td>
                        <td className="px-4 py-3 text-sm">{r.department || '-'}</td>
                        <td className="px-4 py-3 text-sm">{r.position || '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.joinDate || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {r.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{r.phone}</div>}
                            {r.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{r.email}</div>}
                            {!r.phone && !r.email && <span className="text-xs text-muted-foreground">-</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border', statusStyle[r.status] ?? statusStyle.active)}>
                            {statusLabel[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: r })}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(r.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: 휴가 신청 ─── */}
        {tab === 'leave-request' && (
          <div className="space-y-4">
            <AnnualSummaryCard policy={policy} />
            {!loadingLeaves && <MonthTimeline leaves={leaves} />}
            <LeaveForm onSubmitted={loadLeaves} />
          </div>
        )}

        {/* ─── Tab: 휴가 현황 ─── */}
        {tab === 'leave-status' && (
          <div className="space-y-4">
            {/* 내 신청 목록 */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">내 휴가 신청 목록</h3>
              </div>
              {loadingLeaves ? (
                <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : leaves.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">신청 내역이 없습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">번호</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">유형</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">기간</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">일수</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">사유</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">상태</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leaves.map(l => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.businessId}</td>
                        <td className="px-4 py-3">{leaveTypeLabel[l.leaveType] ?? l.leaveType}</td>
                        <td className="px-4 py-3 text-xs">{l.startDate} ~ {l.endDate}</td>
                        <td className="px-4 py-3 text-center">{l.days}일</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-32 truncate">{l.reason || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', leaveStatusStyle[l.status])}>
                              {leaveStatusIcon[l.status]}{leaveStatusLabel[l.status]}
                            </span>
                          </div>
                          {l.status === 'rejected' && l.rejectReason && (
                            <p className="text-[10px] text-red-500 text-center mt-0.5">{l.rejectReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.status === 'pending' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => handleCancel(l.id)}>
                              <Ban className="w-3 h-3 mr-1" /> 취소
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 팀 전체 캘린더 */}
            <TeamCalendar leaves={allLeaves} />
          </div>
        )}

        {/* ─── Tab: 연차 관리 (admin) ─── */}
        {tab === 'leave-admin' && isAdmin && (
          <AdminPanel policy={policy} onPolicyUpdated={loadLeaves} />
        )}

      </div>

      {modal.open && (
        <HRModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); loadRecords(); }} />
      )}
    </div>
  );
}
