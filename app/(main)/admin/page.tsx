'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Trash2, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  created_at: string;
};

const roleLabel: Record<string, string> = { admin: '관리자', manager: '매니저', staff: '직원', accounting: '회계', purchasing: '구매', sales: '영업', quality: '품질', logistics: '물류' };
const statusIcon = { approved: <CheckCircle2 className="w-4 h-4 text-green-500" />, pending: <Clock className="w-4 h-4 text-yellow-500" />, rejected: <XCircle className="w-4 h-4 text-red-500" /> };
const statusLabel = { approved: '승인', pending: '대기', rejected: '거절' };

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/users').then(r => r.json()).then(j => { if (j.data) setUsers(j.data); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const action = async (id: string, payload: Record<string, string>) => {
    setActing(id);
    try {
      await fetch(`/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      load();
    } finally {
      setActing(null);
    }
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`${name} 계정을 삭제하시겠습니까?`)) return;
    setActing(id);
    try {
      await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      load();
    } finally {
      setActing(null);
    }
  };

  const pending = users.filter(u => u.status === 'pending');
  const displayed = tab === 'pending' ? pending : users;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="관리자" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">전체 사용자</p></div>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-yellow-500" /><p className="text-xs text-yellow-700">승인 대기</p></div>
            <p className="text-2xl font-bold text-yellow-700">{pending.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-4 h-4 text-green-500" /><p className="text-xs text-green-700">활성 사용자</p></div>
            <p className="text-2xl font-bold text-green-700">{users.filter(u => u.status === 'approved').length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          <button onClick={() => setTab('pending')} className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', tab === 'pending' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
            승인 대기 {pending.length > 0 && <span className="ml-1 bg-yellow-500 text-white text-[10px] px-1.5 rounded-full">{pending.length}</span>}
          </button>
          <button onClick={() => setTab('all')} className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', tab === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
            전체 사용자
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {tab === 'pending' ? <><Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />대기 중인 가입 신청이 없습니다.</> : '사용자가 없습니다.'}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['이름', '이메일', '부서', '역할', '상태', '가입일', '작업'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayed.map(u => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.department ?? '-'}</td>
                      <td className="px-4 py-3">
                        <select value={u.role} disabled={acting === u.id}
                          onChange={e => action(u.id, { role: e.target.value })}
                          className="text-xs border border-border rounded px-1.5 py-1 bg-background">
                          {Object.entries(roleLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {statusIcon[u.status]}
                          <span className="text-xs">{statusLabel[u.status]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.created_at.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {u.status === 'pending' && (
                            <>
                              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={acting === u.id}
                                onClick={() => action(u.id, { action: 'approve' })}>
                                {acting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />승인</>}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={acting === u.id}
                                onClick={() => action(u.id, { action: 'reject' })}>
                                <XCircle className="w-3 h-3 mr-1" />거절
                              </Button>
                            </>
                          )}
                          {u.status === 'rejected' && (
                            <Button size="sm" className="h-7 text-xs" disabled={acting === u.id}
                              onClick={() => action(u.id, { action: 'approve' })}>
                              <ShieldCheck className="w-3 h-3 mr-1" />재승인
                            </Button>
                          )}
                          {u.status === 'approved' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={acting === u.id}
                              onClick={() => action(u.id, { action: 'reject' })}>
                              정지
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" disabled={acting === u.id}
                            onClick={() => deleteUser(u.id, u.name)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {displayed.map(u => (
                <div key={u.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{u.department ?? ''} · {roleLabel[u.role]}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {statusIcon[u.status]}
                      <span className="text-xs">{statusLabel[u.status]}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {u.status === 'pending' && (
                      <>
                        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700" disabled={acting === u.id}
                          onClick={() => action(u.id, { action: 'approve' })}>
                          {acting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '승인'}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-200" disabled={acting === u.id}
                          onClick={() => action(u.id, { action: 'reject' })}>
                          거절
                        </Button>
                      </>
                    )}
                    {u.status !== 'pending' && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={acting === u.id}
                        onClick={() => action(u.id, { action: u.status === 'approved' ? 'reject' : 'approve' })}>
                        {u.status === 'approved' ? '정지' : '재승인'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 shrink-0" disabled={acting === u.id}
                      onClick={() => deleteUser(u.id, u.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
