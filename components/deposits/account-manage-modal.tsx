'use client';

import { useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface BankAccount {
  id: string; businessId?: string; currency: string; bankName: string; accountNumber: string; holderName?: string; memo?: string;
}

export function AccountManageModal({ accounts, onClose, onChanged }: { accounts: BankAccount[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({ currency: 'USD', bankName: '', accountNumber: '', holderName: '', memo: '' });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.bankName || !form.accountNumber) { alert('은행명과 계좌번호는 필수입니다.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/bank-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ currency: 'USD', bankName: '', accountNumber: '', holderName: '', memo: '' }); onChanged(); }
      else alert((await res.json()).error || '등록 실패');
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('이 계좌를 삭제할까요?')) return;
    const res = await fetch(`/api/bank-accounts/${id}`, { method: 'DELETE' });
    if (res.ok) onChanged(); else alert((await res.json()).error || '삭제 실패');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">입금 계좌 관리</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold">새 계좌 등록</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="KRW">원화 (KRW)</option>
                <option value="USD">USD</option>
                <option value="CNY">RMB (CNY)</option>
              </select>
              <Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="은행명" />
              <Input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="계좌번호" className="col-span-2" />
              <Input value={form.holderName} onChange={e => setForm(f => ({ ...f, holderName: e.target.value }))} placeholder="예금주 (선택)" className="col-span-2" />
            </div>
            <Button size="sm" onClick={add} disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '계좌 등록'}
            </Button>
          </div>
          <div className="space-y-1.5">
            {accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">등록된 계좌가 없습니다.</p>
            ) : accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2">
                <div>
                  <span className="font-semibold">{a.bankName}</span> <span className="text-muted-foreground">{a.accountNumber}</span>
                  <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded">{a.currency}</span>
                  {a.holderName && <span className="ml-2 text-muted-foreground">{a.holderName}</span>}
                </div>
                <button onClick={() => remove(a.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
