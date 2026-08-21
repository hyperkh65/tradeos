'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Trash2, ShieldCheck, Users, UserPlus, Download, X } from 'lucide-react';
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
  type ErpUser = { id: string; email: string; name: string; role: string; department: string | null; status: string; alreadyExists: boolean };

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  // 직접 추가
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'staff', department: '' });
  const [addLoading, setAddLoading] = useState(false);

  // 구 ERP 가져오기
  const [showImport, setShowImport] = useState(false);
  const [importDbPath, setImportDbPath] = useState('');
  const [erpUsers, setErpUsers] = useState<ErpUser[]>([]);
  const [selectedErpIds, setSelectedErpIds] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');

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

  const handleAddUser = async () => {
    if (!addForm.name || !addForm.email || !addForm.password) { alert('이름, 이메일, 비밀번호를 입력하세요.'); return; }
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      }).then(r => r.json());
      if (res.error) { alert(res.error); return; }
      setShowAdd(false);
      setAddForm({ name: '', email: '', password: '', role: 'staff', department: '' });
      load();
    } finally { setAddLoading(false); }
  };

  const loadErpUsers = async () => {
    setImportLoading(true);
    setImportMsg('');
    try {
      const url = `/api/admin/import-from-erp${importDbPath ? `?dbPath=${encodeURIComponent(importDbPath)}` : ''}`;
      const res = await fetch(url).then(r => r.json());
      if (res.error) { setImportMsg(res.error); setErpUsers([]); return; }
      setErpUsers(res.users ?? []);
      setSelectedErpIds(new Set((res.users ?? []).filter((u: ErpUser) => !u.alreadyExists).map((u: ErpUser) => u.id)));
      if (!importDbPath && res.dbPath) setImportDbPath(res.dbPath);
    } finally { setImportLoading(false); }
  };

  const doImport = async () => {
    if (selectedErpIds.size === 0) { alert('가져올 사용자를 선택하세요.'); return; }
    setImportLoading(true);
    try {
      const res = await fetch('/api/admin/import-from-erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbPath: importDbPath, userIds: Array.from(selectedErpIds) }),
      }).then(r => r.json());
      if (res.error) { setImportMsg(res.error); return; }
      setImportMsg(`완료: ${res.imported}명 가져옴, ${res.skipped}명 중복 건너뜀`);
      load();
      setTimeout(() => setShowImport(false), 2000);
    } finally { setImportLoading(false); }
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

      {/* 직접 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">사용자 직접 추가</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: '이름 *', key: 'name', type: 'text', placeholder: '홍길동' },
                { label: '이메일 *', key: 'email', type: 'email', placeholder: 'user@example.com' },
                { label: '비밀번호 *', key: 'password', type: 'password', placeholder: '초기 비밀번호' },
                { label: '부서', key: 'department', type: 'text', placeholder: '영업팀' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                    value={addForm[f.key as keyof typeof addForm]}
                    onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground">역할</label>
                <select className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}>
                  {Object.entries(roleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>취소</Button>
              <Button className="flex-1" onClick={handleAddUser} disabled={addLoading}>
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '추가'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 구 ERP 가져오기 모달 */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold">구 ERP(erp.ynk2014.com) 사용자 가져오기</h3>
              <button onClick={() => setShowImport(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-muted-foreground">구 ERP DB 경로 (NAS 절대경로)</label>
                <div className="flex gap-2 mt-1">
                  <input type="text"
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary font-mono"
                    placeholder="/volume1/web/erp/data/nexport.db"
                    value={importDbPath}
                    onChange={e => setImportDbPath(e.target.value)} />
                  <Button size="sm" className="h-9 shrink-0" onClick={loadErpUsers} disabled={importLoading}>
                    {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
                  </Button>
                </div>
                {importMsg && <p className={`text-xs mt-1 ${importMsg.includes('완료') ? 'text-green-600' : 'text-red-500'}`}>{importMsg}</p>}
              </div>

              {erpUsers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{erpUsers.length}명 확인 · 선택 {selectedErpIds.size}명</p>
                    <div className="flex gap-2">
                      <button className="text-xs text-primary" onClick={() => setSelectedErpIds(new Set(erpUsers.filter(u => !u.alreadyExists).map(u => u.id)))}>
                        미등록 전체선택
                      </button>
                      <button className="text-xs text-muted-foreground" onClick={() => setSelectedErpIds(new Set())}>
                        전체해제
                      </button>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left w-8"></th>
                          <th className="px-3 py-2 text-left">이름</th>
                          <th className="px-3 py-2 text-left">이메일</th>
                          <th className="px-3 py-2 text-left">역할</th>
                          <th className="px-3 py-2 text-left">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {erpUsers.map(u => (
                          <tr key={u.id} className={u.alreadyExists ? 'opacity-40' : 'hover:bg-muted/20'}>
                            <td className="px-3 py-2">
                              <input type="checkbox" disabled={u.alreadyExists}
                                checked={selectedErpIds.has(u.id)}
                                onChange={e => {
                                  setSelectedErpIds(prev => {
                                    const next = new Set(prev);
                                    e.target.checked ? next.add(u.id) : next.delete(u.id);
                                    return next;
                                  });
                                }} />
                            </td>
                            <td className="px-3 py-2 font-medium">{u.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                            <td className="px-3 py-2">{roleLabel[u.role] ?? u.role}</td>
                            <td className="px-3 py-2">
                              {u.alreadyExists
                                ? <span className="text-yellow-600">이미 등록됨</span>
                                : <span className="text-green-600">가져오기 가능</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            {erpUsers.length > 0 && (
              <div className="px-5 pb-5 pt-3 border-t border-border flex gap-2 shrink-0">
                <Button variant="outline" className="flex-1" onClick={() => setShowImport(false)}>취소</Button>
                <Button className="flex-1 gap-1.5" onClick={doImport} disabled={importLoading || selectedErpIds.size === 0}>
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4" />{selectedErpIds.size}명 가져오기</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

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

        {/* Tabs + Actions */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <button onClick={() => setTab('pending')} className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', tab === 'pending' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
            승인 대기 {pending.length > 0 && <span className="ml-1 bg-yellow-500 text-white text-[10px] px-1.5 rounded-full">{pending.length}</span>}
          </button>
          <button onClick={() => setTab('all')} className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', tab === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
            전체 사용자
          </button>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <UserPlus className="w-3.5 h-3.5" />직접 추가
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { setShowImport(true); setErpUsers([]); setImportMsg(''); }}>
              <Download className="w-3.5 h-3.5" />구 ERP 가져오기
            </Button>
          </div>
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
