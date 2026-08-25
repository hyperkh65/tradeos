'use client';

import { useState } from 'react';
import { Plus, Upload, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DepositFile { url: string; filename: string; originalName: string; size: number }
export interface DepositEntry { id: string; date: string; amount: number; accountId?: string; memo?: string; files: DepositFile[] }
interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string }

export function DepositManager({ apiBase, totalDue, deposits, accounts, onChange }: {
  apiBase: string; totalDue: number; deposits: DepositEntry[]; accounts: BankAccount[];
  onChange: (deposits: DepositEntry[]) => void;
}) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: 0, accountId: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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
      const j = await res.json();
      if (res.ok) { onChange(j.data.deposits); setForm({ date: new Date().toISOString().slice(0, 10), amount: 0, accountId: '' }); }
      else alert(j.error || '추가 실패');
    } finally { setSaving(false); }
  };

  const removeEntry = async (depositId: string) => {
    if (!confirm('이 입금 기록을 삭제할까요?')) return;
    const res = await fetch(`${apiBase}/deposits/${depositId}`, { method: 'DELETE' });
    const j = await res.json();
    if (res.ok) onChange(j.data.deposits);
  };

  const uploadFile = async (depositId: string, file: File) => {
    setUploadingId(depositId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/deposits/${depositId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) onChange(deposits.map(d => d.id === depositId ? { ...d, files: [...d.files, j.data] } : d));
      else alert(j.error || '업로드 실패');
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
                  <button type="button" onClick={() => removeEntry(d.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
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
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">금액</label>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">계좌</label>
          <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">-</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.bankName} {a.accountNumber}</option>)}
          </select>
        </div>
        <Button type="button" size="sm" onClick={addEntry} disabled={saving} className="h-8">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}
