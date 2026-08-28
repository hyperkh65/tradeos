'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileCheck2, Plus, Loader2, X, Search, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectRow {
  id: string; businessId: string; productName: string; modelName: string;
  docType: string; customerName?: string; supplierName?: string; status: string;
  dueDate?: string; createdByName?: string; createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨', color: 'bg-blue-100 text-blue-700' },
  editing: { label: '수정중', color: 'bg-amber-100 text-amber-700' },
  resubmitted: { label: '재제출됨', color: 'bg-indigo-100 text-indigo-700' },
  internal_review: { label: '내부 검토중', color: 'bg-purple-100 text-purple-700' },
  closed: { label: '마감됨', color: 'bg-red-100 text-red-700' },
};

const DOC_TYPE_LABEL: Record<string, string> = { approval: '제품 승인서', spec: '제품 사양서', both: '승인서 겸 사양서' };

const PRODUCT_CATEGORIES = [
  'LED 램프', 'LED 등기구', 'LED 직관형 램프', '다운라이트', '평판조명', '공장등', '투광등',
  '가로등 및 보안등', '경관조명', '식물성장용 조명', '컨버터 내장형 제품', '컨버터 외장형 제품',
  'LED 모듈', '컨버터', '기타',
];

interface CompanyOption { id: string; name: string; type: string; contactPerson?: string }

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    docType: 'approval', productName: '', modelName: '', productCategory: PRODUCT_CATEGORIES[0],
    supplierName: '', customerName: '', contactPerson: '',
    dueDate: '', defaultLanguage: 'zh', memo: '',
    hasConverter: '' as '' | 'true' | 'false',
    templateId: '', brandProfileId: '',
  });
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(j => setCompanies(Array.isArray(j.data) ? j.data : [])).catch(() => {});
    fetch('/api/approval-documents/templates').then(r => r.json()).then(j => setTemplates(j.data || [])).catch(() => {});
    fetch('/api/approval-documents/brand-profiles').then(r => r.json()).then(j => setProfiles(j.data || [])).catch(() => {});
  }, []);

  const applySupplier = (name: string) => {
    const co = companies.find(c => c.name === name);
    setForm(f => ({ ...f, supplierName: name, contactPerson: co?.contactPerson || f.contactPerson }));
  };

  const submit = async () => {
    if (!form.productName.trim() || !form.modelName.trim()) { alert('제품명과 기본 모델명은 필수입니다.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/approval-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          hasConverter: form.hasConverter === '' ? null : form.hasConverter === 'true',
          templateId: form.templateId || null,
          brandProfileId: form.brandProfileId || null,
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
          <span className="font-semibold text-sm">제품 승인서·사양서 프로젝트 생성</span>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); submit(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">문서 유형 *</label>
            <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="approval">제품 승인서</option>
              <option value="spec">제품 사양서</option>
              <option value="both">승인서 겸 사양서</option>
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">제품명 *</label><Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="예: LED 평판조명 600x600" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">기본 모델명 *</label><Input value={form.modelName} onChange={e => setForm(f => ({ ...f, modelName: e.target.value }))} placeholder="예: ABC-1234-XY" /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">제품 분류</label>
            <select value={form.productCategory} onChange={e => setForm(f => ({ ...f, productCategory: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">컨버터 사용 여부</label>
            <select value={form.hasConverter} onChange={e => setForm(f => ({ ...f, hasConverter: e.target.value as '' | 'true' | 'false' }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">아직 모름 (나중에 섹션 화면에서 지정)</option>
              <option value="true">컨버터 있음</option>
              <option value="false">컨버터 없음</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">공급업체명</label>
            <Input list="apd-suppliers" value={form.supplierName} onChange={e => applySupplier(e.target.value)} placeholder="입력 또는 목록에서 선택" />
            <datalist id="apd-suppliers">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">고객사명</label><Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">공급업체 담당자</label><Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">제출기한</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">작성 화면 기본 언어</label>
            <select value={form.defaultLanguage} onChange={e => setForm(f => ({ ...f, defaultLanguage: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="zh">中文 (중국어)</option>
              <option value="en">English (영어)</option>
              <option value="ko">한국어</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">템플릿</label>
            <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">기본(무채색)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">브랜드 프로필</label>
            <select value={form.brandProfileId} onChange={e => setForm(f => ({ ...f, brandProfileId: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">선택 안함</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">메모</label>
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

export default function ApprovalDocumentsPage() {
  const [list, setList] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/approval-documents').then(r => r.json()).then(j => setList(j.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (docTypeFilter && p.docType !== docTypeFilter) return false;
      if (!q) return true;
      return [p.businessId, p.productName, p.modelName, p.supplierName, p.customerName, p.createdByName]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [list, search, statusFilter, docTypeFilter]);

  const toggleSelect = (id: string) => {
    setSelected(s => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
  };

  const bulkDownload = async () => {
    setBulkBusy(true);
    try {
      const r = await fetch('/api/approval-documents/bulk-download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '다운로드 실패'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `제품승인서_${selected.size}건.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally { setBulkBusy(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="제품 승인서·사양서" icon={<FileCheck2 className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="제품명, 모델명, 업체명, 담당자 검색..." className="pl-8" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">전체 문서유형</option>
            {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" onClick={bulkDownload} disabled={bulkBusy} className="gap-1.5">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}선택 {selected.size}건 일괄 다운로드
            </Button>
          )}
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
                    <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleSelectAll} /></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">문서유형</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">제품명</th>
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
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                      <td className="px-3 py-2"><Link href={`/approval-documents/${p.id}`} className="font-mono text-primary hover:underline">{p.businessId}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground">{DOC_TYPE_LABEL[p.docType] || p.docType}</td>
                      <td className="px-3 py-2"><Link href={`/approval-documents/${p.id}`} className="hover:underline">{p.productName}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.modelName}</td>
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
          onCreated={(newId) => { setCreateOpen(false); load(); window.location.href = `/approval-documents/${newId}`; }}
        />
      )}
    </div>
  );
}
