'use client';

import { useState, forwardRef, useImperativeHandle } from 'react';
import { Plus, Upload, Trash2, Loader2, CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccountManageModal } from '@/components/deposits/account-manage-modal';

interface DepositFile { url: string; filename: string; originalName: string; size: number }
export interface DepositEntry { id: string; date: string; amount: number; accountId?: string; memo?: string; files: DepositFile[] }
interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string }

/** 상위 모달의 "저장" 버튼이 입금 내역 입력칸에 남아있는 값을 놓치지 않게 하기 위한
 * 탈출구 — 입금 등록(+버튼)과 상위 폼 저장은 원래 완전히 별개의 액션이라, 사용자가
 * 금액만 입력하고 곧장 "저장"을 누르면 입금이 조용히 유실되는 문제가 있었다. */
export interface DepositManagerHandle {
  flushPending: () => Promise<void>;
}

export const DepositManager = forwardRef<DepositManagerHandle, {
  apiBase: string; totalDue: number; deposits: DepositEntry[]; accounts: BankAccount[];
  onChange: (deposits: DepositEntry[]) => void;
  onAccountsRefresh: () => void;
}>(function DepositManager({ apiBase, totalDue, deposits, accounts, onChange, onAccountsRefresh }, ref) {
  const [manageAccountsOpen, setManageAccountsOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: 0, accountId: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
  const remaining = Math.round((totalDue - totalDeposited) * 100) / 100;
  const status = totalDeposited <= 0 ? 'unpaid' : remaining > 0 ? 'partial' : remaining === 0 ? 'paid' : 'overpaid';
  const statusLabel = { unpaid: '미입금', partial: '부분입금', paid: '완납', overpaid: '초과입금' }[status];
  const statusColor = {
    unpaid: 'bg-gray-100 text-gray-600', partial: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700', overpaid: 'bg-red-100 text-red-700',
  }[status];

  const addEntry = async () => {
    if (!form.date || !form.amount) { alert('날짜와 금액을 입력하세요.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/deposits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { onChange(j.data.deposits); setForm({ date: new Date().toISOString().slice(0, 10), amount: 0, accountId: '' }); }
      else alert(j.error || `추가 실패 (HTTP ${res.status})`);
    } catch (err) {
      alert('입금 등록 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.\n' + (err instanceof Error ? err.message : String(err)));
    } finally { setSaving(false); }
  };

  useImperativeHandle(ref, () => ({
    flushPending: async () => {
      if (form.date && form.amount) await addEntry();
    },
  }), [form]);

  const removeEntry = async (depositId: string) => {
    setConfirmingId(null);
    setDeletingId(depositId);
    try {
      const res = await fetch(`${apiBase}/deposits/${depositId}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) onChange(j.data?.deposits ?? deposits.filter(d => d.id !== depositId));
      else alert(j.error || `삭제 실패 (HTTP ${res.status})`);
    } catch (err) {
      alert('삭제 요청 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.\n' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingId(null);
    }
  };

  const uploadFile = async (depositId: string, file: File) => {
    setUploadingId(depositId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/deposits/${depositId}/upload`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) onChange(deposits.map(d => d.id === depositId ? { ...d, files: [...d.files, j.data] } : d));
      else alert(j.error || `업로드 실패 (HTTP ${res.status})`);
    } catch (err) {
      alert('업로드 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.\n' + (err instanceof Error ? err.message : String(err)));
    } finally { setUploadingId(null); }
  };

  const accountLabel = (id?: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? `${a.bankName} ${a.accountNumber}` : '-';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">입금 내역</p>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusColor)}>{statusLabel}</span>
      </div>
      <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs flex justify-between">
        <span>입금액 합계 {totalDeposited.toLocaleString()}</span>
        <span>잔액 {remaining.toLocaleString()}</span>
      </div>

      {deposits.length > 0 && (
        <div className="space-y-1.5">
          {deposits.map(d => (
            <div key={d.id} className="border rounded-lg px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{d.date}</span>
                  <span className="ml-2">{d.amount.toLocaleString()}</span>
                  <span className="ml-2 text-muted-foreground">{accountLabel(d.accountId)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-primary hover:underline cursor-pointer flex items-center gap-1">
                    {uploadingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(d.id, f); e.target.value = ''; }} />
                  </label>
                  {confirmingId === d.id ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => removeEntry(d.id)} disabled={deletingId === d.id}
                        className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded px-1.5 py-0.5 flex items-center gap-1">
                        {deletingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '삭제확정'}
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="text-[10px] text-muted-foreground hover:text-foreground px-1">취소</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingId(d.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              </div>
              {d.files.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.files.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-[10px] bg-muted px-1.5 py-0.5 rounded hover:underline truncate max-w-[140px]">{f.originalName}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t pt-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">날짜</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">금액</label>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] text-muted-foreground">계좌</label>
            <button type="button" onClick={() => setManageAccountsOpen(true)} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
              <CreditCard className="w-2.5 h-2.5" /> 계좌 등록
            </button>
          </div>
          <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">-</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.bankName} {a.accountNumber}</option>)}
          </select>
        </div>
        <Button type="button" size="sm" onClick={addEntry} disabled={saving} className="h-8 gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}추가
        </Button>
      </div>
      {form.amount > 0 && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          위 금액은 아직 입금 내역에 추가되지 않았습니다. &quot;추가&quot; 버튼을 눌러야 반영됩니다(하단의 저장 버튼과는 별개입니다).
        </p>
      )}
      {accounts.length === 0 && (
        <p className="text-[10px] text-muted-foreground">등록된 입금 계좌가 없습니다. 위 &quot;계좌 등록&quot;을 눌러 먼저 계좌를 등록하세요.</p>
      )}

      {manageAccountsOpen && (
        <AccountManageModal
          accounts={accounts}
          onClose={() => setManageAccountsOpen(false)}
          onChanged={onAccountsRefresh}
        />
      )}
    </div>
  );
});
