'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Landmark, Plus, Loader2, X, Upload, Trash2, Lock, Unlock, Pencil, CreditCard, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface BankAccount {
  id: string; businessId: string; currency: string; bankName: string; accountNumber: string; holderName?: string; memo?: string;
}
interface CommissionFile { url: string; filename: string; originalName: string; size: number; uploadedAt: string }
interface Commission {
  id: string; businessId: string; foreignCompany: string; date: string;
  currency: string; amount: number; exchangeRate: number; amountKrw: number;
  accountId?: string; depositDate?: string;
  invoiceFiles: CommissionFile[]; depositFiles: CommissionFile[];
  memo?: string; status: 'open' | 'closed'; journalEntryId?: string;
}

const CURRENCIES = ['USD', 'CNY', 'EUR', 'JPY', 'KRW'];

export default function CommissionsPage() {
  const [list, setList] = useState<Commission[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<{ open: boolean; item?: Commission | null }>({ open: false });
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/commissions').then(r => r.json()),
      fetch('/api/bank-accounts').then(r => r.json()),
    ]).then(([c, a]) => {
      setList(Array.isArray(c.data) ? c.data : []);
      setAccounts(Array.isArray(a.data) ? a.data : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const accountLabel = (id?: string) => {
    const a = accounts.find(x => x.id === id);
    if (!a) return '-';
    return `${a.bankName} ${a.accountNumber} (${a.currency})`;
  };

  const toggleClose = async (item: Commission) => {
    const action = item.status === 'closed' ? 'reopen' : 'close';
    if (action === 'close' && !confirm(`${item.businessId} 건을 마감하고 회계전표를 생성할까요?`)) return;
    if (action === 'reopen' && !confirm('마감을 취소하고 생성된 전표를 삭제할까요?')) return;
    const res = await fetch(`/api/commissions/${item.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (res.ok) load(); else alert((await res.json()).error || '처리 실패');
  };

  const remove = async (item: Commission) => {
    if (!confirm(`${item.businessId} 건을 삭제할까요?`)) return;
    const res = await fetch(`/api/commissions/${item.id}`, { method: 'DELETE' });
    if (res.ok) load(); else alert((await res.json()).error || '삭제 실패');
  };

  const totalsByCurrency: Record<string, number> = {};
  for (const c of list) totalsByCurrency[c.currency] = (totalsByCurrency[c.currency] || 0) + c.amount;

  // 업체별 통화별 합계
  const byCompany = new Map<string, Record<string, number>>();
  for (const c of list) {
    const m = byCompany.get(c.foreignCompany) || {};
    m[c.currency] = (m[c.currency] || 0) + c.amount;
    byCompany.set(c.foreignCompany, m);
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="커미션 (해외 수수료)" icon={<Landmark className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(totalsByCurrency).map(([cur, amt]) => (
              <div key={cur} className="bg-card border rounded-xl px-4 py-2">
                <p className="text-[10px] text-muted-foreground">{cur} 합계</p>
                <p className="text-sm font-bold">{amt.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAccountModalOpen(true)} className="gap-1.5">
              <CreditCard className="w-4 h-4" /> 계좌 관리
            </Button>
            <a href="/api/commissions/export?format=excel"><Button variant="outline" className="gap-1.5"><FileSpreadsheet className="w-4 h-4" /> 엑셀</Button></a>
            <a href="/api/commissions/export?format=pdf" target="_blank" rel="noreferrer"><Button variant="outline" className="gap-1.5"><FileText className="w-4 h-4" /> PDF</Button></a>
            <Button onClick={() => setModalOpen({ open: true })} className="gap-1.5">
              <Plus className="w-4 h-4" /> 커미션 등록
            </Button>
          </div>
        </div>

        {byCompany.size > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs font-semibold mb-2">업체별 합계</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Array.from(byCompany.entries()).map(([name, sums]) => (
                <div key={name} className="border rounded-lg px-3 py-2">
                  <p className="text-xs font-medium truncate">{name}</p>
                  {Object.entries(sums).map(([cur, amt]) => (
                    <p key={cur} className="text-[11px] text-muted-foreground">{cur} {amt.toLocaleString()}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">등록된 커미션이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[980px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">해외업체명</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">일자</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">금액</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">환율</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">원화환산</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">입금계좌</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">입금일</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">파일</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">상태</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{c.businessId}</td>
                      <td className="px-3 py-2"><span className="truncate block max-w-[160px]">{c.foreignCompany}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.date}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{c.currency} {c.amount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{c.currency === 'KRW' ? '-' : (c.exchangeRate ? c.exchangeRate.toLocaleString() : <span className="text-muted-foreground">미입력</span>)}</td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{c.amountKrw ? `${c.amountKrw.toLocaleString()}원` : <span className="text-muted-foreground font-normal">-</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground"><span className="truncate block max-w-[160px]">{accountLabel(c.accountId)}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.depositDate || '-'}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{c.invoiceFiles.length + c.depositFiles.length}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', c.status === 'closed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                          {c.status === 'closed' ? '마감' : '진행중'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {c.status === 'open' && (
                            <button onClick={() => setModalOpen({ open: true, item: c })} className="text-muted-foreground hover:text-foreground" title="수정"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => toggleClose(c)} className={c.status === 'closed' ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'} title={c.status === 'closed' ? '마감취소' : '전표마감'}>
                            {c.status === 'closed' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          {c.status === 'open' && (
                            <button onClick={() => remove(c)} className="text-red-400 hover:text-red-600" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalOpen.open && (
        <CommissionModal
          item={modalOpen.item}
          knownCompanies={Array.from(new Set(list.map(c => c.foreignCompany).filter(Boolean)))}
          accounts={accounts}
          onClose={() => setModalOpen({ open: false })}
          onSaved={() => { setModalOpen({ open: false }); load(); }}
        />
      )}
      {accountModalOpen && (
        <AccountManageModal accounts={accounts} onClose={() => setAccountModalOpen(false)} onChanged={load} />
      )}
    </div>
  );
}

function CommissionModal({ item, accounts, knownCompanies, onClose, onSaved }: {
  item?: Commission | null; accounts: BankAccount[]; knownCompanies: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    foreignCompany: item?.foreignCompany || '',
    date: item?.date || new Date().toISOString().slice(0, 10),
    currency: item?.currency || 'USD',
    amount: item?.amount ?? 0,
    exchangeRate: item?.exchangeRate ?? 0,
    accountId: item?.accountId || '',
    depositDate: item?.depositDate || '',
    memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);
  const [invoiceFiles, setInvoiceFiles] = useState<CommissionFile[]>(item?.invoiceFiles || []);
  const [depositFiles, setDepositFiles] = useState<CommissionFile[]>(item?.depositFiles || []);
  const [savedId, setSavedId] = useState(item?.id || '');
  const [uploading, setUploading] = useState<'invoice' | 'deposit' | null>(null);

  const amountKrw = form.currency === 'KRW' ? Math.round(form.amount) : Math.round(form.amount * form.exchangeRate);

  const save = async () => {
    if (!form.foreignCompany || !form.date || !form.amount) { alert('해외업체명, 일자, 금액은 필수입니다.'); return; }
    setSaving(true);
    try {
      const url = savedId ? `/api/commissions/${savedId}` : '/api/commissions';
      const res = await fetch(url, {
        method: savedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '저장 실패'); return; }
      if (!savedId) setSavedId(j.data.id);
      onSaved();
    } finally { setSaving(false); }
  };

  const uploadFile = async (file: File, fileType: 'invoice' | 'deposit') => {
    if (!savedId) { alert('먼저 저장한 뒤 파일을 첨부할 수 있습니다.'); return; }
    setUploading(fileType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileType', fileType);
      const res = await fetch(`/api/commissions/${savedId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) {
        if (fileType === 'invoice') setInvoiceFiles(f => [...f, j.data]);
        else setDepositFiles(f => [...f, j.data]);
      } else alert(j.error || '업로드 실패');
    } finally { setUploading(null); }
  };

  const removeFile = async (fileType: 'invoice' | 'deposit', f: CommissionFile) => {
    if (!savedId) return;
    const filenameParam = `${fileType}_${f.filename}`;
    const res = await fetch(`/api/commissions/${savedId}/files/${filenameParam}`, { method: 'DELETE' });
    if (res.ok) {
      if (fileType === 'invoice') setInvoiceFiles(list => list.filter(x => x.filename !== f.filename));
      else setDepositFiles(list => list.filter(x => x.filename !== f.filename));
    }
  };

  const FileZone = ({ label, files, type }: { label: string; files: CommissionFile[]; type: 'invoice' | 'deposit' }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
          {uploading === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          파일 추가
          <input type="file" className="hidden" multiple
            onChange={e => { Array.from(e.target.files || []).forEach(f => uploadFile(f, type)); e.target.value = ''; }} />
        </label>
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-lg px-3 py-2">첨부된 파일 없음</p>
      ) : (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5">
              <a href={f.url} target="_blank" rel="noreferrer" className="truncate max-w-[220px] hover:underline">{f.originalName}</a>
              <button onClick={() => removeFile(type, f)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{item ? '커미션 수정' : '커미션 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">해외업체명 *</label>
              <Input list="foreign-companies" value={form.foreignCompany} onChange={e => setForm(f => ({ ...f, foreignCompany: e.target.value }))} placeholder="Foreign Co., Ltd." />
              <datalist id="foreign-companies">
                {knownCompanies.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">일자 *</label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">화폐단위</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">금액 *</label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">환율 {form.currency === 'KRW' && '(원화는 1)'}</label>
              <Input type="number" step="0.01" value={form.currency === 'KRW' ? 1 : form.exchangeRate} disabled={form.currency === 'KRW'} onChange={e => setForm(f => ({ ...f, exchangeRate: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2 bg-muted/30 rounded-lg px-3 py-2 text-sm flex justify-between">
              <span className="text-muted-foreground">원화 환산액</span>
              <span className="font-bold">{amountKrw.toLocaleString()}원</span>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">입금계좌</label>
              <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- 선택 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.bankName} {a.accountNumber} ({a.currency})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">입금받은 날짜</label>
              <Input type="date" value={form.depositDate} onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">비고</label>
              <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="참고사항" />
            </div>
          </div>

          {savedId ? (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <FileZone label="해외 인보이스" files={invoiceFiles} type="invoice" />
              <FileZone label="입금내역" files={depositFiles} type="deposit" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">먼저 저장하면 인보이스/입금내역 파일을 첨부할 수 있습니다.</p>
          )}
        </div>
        <div className="p-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (savedId ? '수정 저장' : '등록')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountManageModal({ accounts, onClose, onChanged }: { accounts: BankAccount[]; onClose: () => void; onChanged: () => void }) {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2">
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
