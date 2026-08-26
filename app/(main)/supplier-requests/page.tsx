'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardCheck, Plus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectRow {
  id: string; businessId: string; productName: string; internalRefNo?: string; supplierName: string;
  contactPerson?: string; dueDate?: string; status: string; createdByName?: string; createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨', color: 'bg-blue-100 text-blue-700' },
  editing: { label: '수정중', color: 'bg-amber-100 text-amber-700' },
  resubmitted: { label: '재제출됨', color: 'bg-indigo-100 text-indigo-700' },
  closed: { label: '마감됨', color: 'bg-red-100 text-red-700' },
};

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    productName: '', internalRefNo: '', supplierName: '', contactPerson: '',
    requestedAt: new Date().toISOString().slice(0, 10), dueDate: '', memo: '', defaultLanguage: 'zh',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.productName.trim() || !form.supplierName.trim()) { alert('제품명과 공급업체명은 필수입니다.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/supplier-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '생성 실패'); return; }
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">자료요청 프로젝트 생성</span>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div><label className="text-xs text-muted-foreground mb-1 block">프로젝트 제품명 *</label><Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="예: Parking Lot Light PIR Type" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">내부 관리번호</label><Input value={form.internalRefNo} onChange={e => setForm(f => ({ ...f, internalRefNo: e.target.value }))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">공급업체명 *</label><Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="예: Kumho" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">담당자</label><Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground mb-1 block">제출 요청일</label><Input type="date" value={form.requestedAt} onChange={e => setForm(f => ({ ...f, requestedAt: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">제출기한</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">작성 화면 기본 언어</label>
            <select value={form.defaultLanguage} onChange={e => setForm(f => ({ ...f, defaultLanguage: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="zh">中文 (중국어)</option>
              <option value="en">English (영어)</option>
              <option value="ko">한국어</option>
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">메모</label>
            <textarea className="w-full min-h-[70px] text-sm rounded-md border border-input bg-background px-3 py-2" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '생성'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierRequestsPage() {
  const [list, setList] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/supplier-requests').then(r => r.json()).then(j => setList(j.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="공급업체 자료요청" icon={<ClipboardCheck className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" />자료요청 프로젝트 생성</Button>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">등록된 자료요청 프로젝트가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[860px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">제품명</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">공급업체</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">담당자</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">제출기한</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">상태</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">생성자</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2"><Link href={`/supplier-requests/${p.id}`} className="font-mono text-primary hover:underline">{p.businessId}</Link></td>
                      <td className="px-3 py-2"><Link href={`/supplier-requests/${p.id}`} className="hover:underline">{p.productName}</Link></td>
                      <td className="px-3 py-2">{p.supplierName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.contactPerson || '-'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.dueDate || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_LABEL[p.status]?.color)}>{STATUS_LABEL[p.status]?.label || p.status}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.createdByName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />}
    </div>
  );
}
