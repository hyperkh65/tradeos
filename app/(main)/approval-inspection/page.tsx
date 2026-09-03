'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BadgeCheck, Plus, Loader2, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectRow {
  id: string; businessId: string; reportType: 'pre_approval' | 'pre_shipment';
  projectName: string; productName?: string; baseModelName?: string;
  customerName?: string; supplierName?: string; status: string;
  dueDate?: string; createdByName?: string; createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨', color: 'bg-blue-100 text-blue-700' },
  revision_requested: { label: '수정요청', color: 'bg-amber-100 text-amber-700' },
  revising: { label: '수정중', color: 'bg-amber-100 text-amber-700' },
  resubmitted: { label: '재제출됨', color: 'bg-indigo-100 text-indigo-700' },
  internal_review: { label: '내부 검토중', color: 'bg-purple-100 text-purple-700' },
  approved: { label: '승인됨', color: 'bg-green-100 text-green-700' },
  conditional_approval: { label: '조건부 승인', color: 'bg-teal-100 text-teal-700' },
  shipment_hold: { label: '출고 보류', color: 'bg-orange-100 text-orange-700' },
  closed: { label: '마감됨', color: 'bg-red-100 text-red-700' },
};

const REPORT_TYPE_LABEL: Record<string, string> = { pre_approval: '사전승인서', pre_shipment: '출고선적승인서' };

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    reportType: 'pre_approval' as 'pre_approval' | 'pre_shipment',
    projectName: '', internalRefNo: '', customerName: '', supplierName: '', manufacturerName: '',
    productCategory: '', productName: '', baseModelName: '',
    poNumber: '', piNumber: '', productionLotNo: '',
    productionQty: '', inspectionQty: '',
    shipDate: '', shippingDate: '', requestDate: '', dueDate: '',
    internalContact: '', supplierContact: '', memo: '',
    referenceProjectId: '', referenceMode: 'existing' as 'existing' | 'new',
    defaultLanguage: 'zh',
  });
  const [saving, setSaving] = useState(false);
  const [refCandidates, setRefCandidates] = useState<ProjectRow[]>([]);

  useEffect(() => {
    if (form.reportType !== 'pre_shipment') return;
    fetch('/api/approval-inspection?reportType=pre_approval').then(r => r.json()).then(j => {
      const rows: ProjectRow[] = j.data || [];
      setRefCandidates(rows.filter(r => r.status === 'approved' || r.status === 'closed' || r.status === 'conditional_approval'));
    }).catch(() => {});
  }, [form.reportType]);

  const submit = async () => {
    if (!form.projectName.trim()) { alert('프로젝트명은 필수입니다.'); return; }
    if (form.reportType === 'pre_shipment' && form.referenceMode === 'existing' && !form.referenceProjectId) {
      alert('기준 사전승인서를 선택하거나 "기준 없이 신규 작성"을 선택하세요.'); return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/approval-inspection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          productionQty: form.productionQty ? Number(form.productionQty) : null,
          inspectionQty: form.inspectionQty ? Number(form.inspectionQty) : null,
          referenceProjectId: form.reportType === 'pre_shipment' && form.referenceMode === 'existing' ? form.referenceProjectId : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '생성 실패'); return; }
      onCreated(j.data.id);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">제품 승인검사 프로젝트 생성</span>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); submit(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">승인서 종류 *</label>
            <select value={form.reportType} onChange={e => setForm(f => ({ ...f, reportType: e.target.value as 'pre_approval' | 'pre_shipment' }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="pre_approval">사전승인서 (Product Pre-approval Report)</option>
              <option value="pre_shipment">출고선적승인서 (Pre-shipment Approval Report)</option>
            </select>
          </div>
          {form.reportType === 'pre_shipment' && (
            <div className="rounded-md border border-input p-3 space-y-2 bg-muted/30">
              <label className="text-xs text-muted-foreground block">기준 사전승인서</label>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="radio" checked={form.referenceMode === 'existing'} onChange={() => setForm(f => ({ ...f, referenceMode: 'existing' }))} />기존 사전승인서 기준</label>
                <label className="flex items-center gap-1"><input type="radio" checked={form.referenceMode === 'new'} onChange={() => setForm(f => ({ ...f, referenceMode: 'new' }))} />기준 없이 신규 작성</label>
              </div>
              {form.referenceMode === 'existing' && (
                <select value={form.referenceProjectId} onChange={e => setForm(f => ({ ...f, referenceProjectId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs">
                  <option value="">승인 완료/마감된 사전승인서 선택...</option>
                  {refCandidates.map(p => <option key={p.id} value={p.id}>{p.businessId} — {p.productName || p.projectName} ({p.baseModelName})</option>)}
                </select>
              )}
            </div>
          )}
          <div><label className="text-xs text-muted-foreground mb-1 block">프로젝트명 *</label><Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} placeholder="예: PY-50W-36V-NF 사전승인" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">내부 관리번호</label><Input value={form.internalRefNo} onChange={e => setForm(f => ({ ...f, internalRefNo: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">고객사</label><Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">공급업체</label><Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">제조업체</label><Input value={form.manufacturerName} onChange={e => setForm(f => ({ ...f, manufacturerName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">제품 구분</label><Input value={form.productCategory} onChange={e => setForm(f => ({ ...f, productCategory: e.target.value }))} placeholder="예: 컨버터" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">제품명</label><Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">기본 모델명</label><Input value={form.baseModelName} onChange={e => setForm(f => ({ ...f, baseModelName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">PO 번호{form.reportType === 'pre_shipment' && ' *'}</label><Input value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">PI 번호</label><Input value={form.piNumber} onChange={e => setForm(f => ({ ...f, piNumber: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">생산 LOT 번호{form.reportType === 'pre_shipment' && ' *'}</label><Input value={form.productionLotNo} onChange={e => setForm(f => ({ ...f, productionLotNo: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">생산수량{form.reportType === 'pre_shipment' && ' *'}</label><Input type="number" value={form.productionQty} onChange={e => setForm(f => ({ ...f, productionQty: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">검사수량{form.reportType === 'pre_shipment' && ' *'}</label><Input type="number" value={form.inspectionQty} onChange={e => setForm(f => ({ ...f, inspectionQty: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">출고예정일</label><Input type="date" value={form.shipDate} onChange={e => setForm(f => ({ ...f, shipDate: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">선적예정일</label><Input type="date" value={form.shippingDate} onChange={e => setForm(f => ({ ...f, shippingDate: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">작성 요청일</label><Input type="date" value={form.requestDate} onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">제출기한</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground mb-1 block">내부 담당자</label><Input value={form.internalContact} onChange={e => setForm(f => ({ ...f, internalContact: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">공급업체 담당자</label><Input value={form.supplierContact} onChange={e => setForm(f => ({ ...f, supplierContact: e.target.value }))} /></div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">작성 화면 기본 언어</label>
            <select value={form.defaultLanguage} onChange={e => setForm(f => ({ ...f, defaultLanguage: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="zh">中文 (중국어)</option>
              <option value="en">English (영어)</option>
              <option value="ko">한국어</option>
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">비고</label>
            <textarea className="w-full min-h-[70px] text-sm rounded-md border border-input bg-background px-3 py-2" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
        </form>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '생성'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalInspectionPage() {
  const [list, setList] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/approval-inspection').then(r => r.json()).then(j => setList(j.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (typeFilter && p.reportType !== typeFilter) return false;
      if (!q) return true;
      return [p.businessId, p.projectName, p.productName, p.baseModelName, p.supplierName, p.customerName, p.createdByName]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [list, search, statusFilter, typeFilter]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="제품 승인검사" icon={<BadgeCheck className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="프로젝트명, 제품명, 모델명, 업체명 검색..." className="pl-8" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">전체 종류</option>
            {Object.entries(REPORT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5 ml-auto"><Plus className="w-4 h-4" />프로젝트 생성</Button>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">{list.length === 0 ? '등록된 프로젝트가 없습니다.' : '검색 결과가 없습니다.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[940px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">종류</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">프로젝트명</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">모델명</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">공급업체</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">고객사</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">제출기한</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">상태</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">생성자</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2"><Link href={`/approval-inspection/${p.id}`} className="font-mono text-primary hover:underline">{p.businessId}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground">{REPORT_TYPE_LABEL[p.reportType]}</td>
                      <td className="px-3 py-2"><Link href={`/approval-inspection/${p.id}`} className="hover:underline">{p.projectName}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.baseModelName || '-'}</td>
                      <td className="px-3 py-2">{p.supplierName || '-'}</td>
                      <td className="px-3 py-2">{p.customerName || '-'}</td>
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

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => { setCreateOpen(false); load(); window.location.href = `/approval-inspection/${newId}`; }}
        />
      )}
    </div>
  );
}
