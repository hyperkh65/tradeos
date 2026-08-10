'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserCog, Plus, Search, X, Pencil, Trash2, Loader2, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface HRRecord {
  id: string; name: string; nameEn?: string;
  department: string; position: string; joinDate?: string;
  phone?: string; email?: string; status: string;
  salary?: number; memo?: string; createdAt: string;
}

const DEPARTMENTS = ['경영', '영업', '무역', '물류', '회계', '관리', '기타'];
const POSITIONS = ['대표', '이사', '부장', '차장', '과장', '대리', '사원', '인턴'];
const statusStyle: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  leave: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  resigned: 'bg-gray-100 text-gray-500 border-gray-200',
};
const statusLabel: Record<string, string> = { active: '재직', leave: '휴직', resigned: '퇴직' };

function HRModal({ item, onClose, onSave }: { item?: HRRecord | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    nameEn: item?.nameEn || '',
    department: item?.department || '무역',
    position: item?.position || '사원',
    joinDate: item?.joinDate || '',
    phone: item?.phone || '',
    email: item?.email || '',
    status: (item?.status || 'active') as string,
    salary: item?.salary?.toString() || '',
    memo: item?.memo || '',
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

export default function HRPage() {
  const [records, setRecords] = useState<HRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: HRRecord | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/hr').then(r => r.json());
    setRecords(Array.isArray(res.data) ? res.data : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('직원 정보를 삭제하시겠습니까?')) return;
    await fetch(`/api/hr/${id}`, { method: 'DELETE' });
    load();
  };

  const depts = ['전체', ...DEPARTMENTS.filter(d => records.some(r => r.department === d))];
  const filtered = records.filter(r => {
    const ms = r.name.includes(search) || (r.nameEn ?? '').includes(search) || (r.position ?? '').includes(search);
    const md = deptFilter === '전체' || r.department === deptFilter;
    return ms && md;
  });

  const activeCount = records.filter(r => r.status === 'active').length;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="인사 관리 (HR)" icon={<UserCog className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        {/* Summary */}
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

        {/* Filters */}
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

        {loading ? (
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
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      {r.nameEn && <p className="text-xs text-muted-foreground">{r.nameEn}</p>}
                    </td>
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
      {modal.open && (
        <HRModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
