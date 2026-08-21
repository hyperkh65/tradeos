'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertCircle, Plus, Search, X, Loader2, Pencil, Trash2,
  ExternalLink, FileText, ShoppingCart, AlertTriangle, Upload, Image, Paperclip,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Claim } from '@/types';

// ─── constants ────────────────────────────────────────────────────────────────

const ISSUE_TYPES = ['품질', '수량', '파손', '지연', '사양', '기타'];
const STATUS_OPTIONS = ['접수', '내부확인', '업체전달', '협상', '합의', '완료'];
const COMPENSATION_TYPES = ['차감', '교환', '환불', '부분환불', '재작업', '크레딧', '폐기', '보상없음', '기타'];
const CURRENCIES = ['USD', 'KRW', 'CNY', 'EUR'];

const statusStyle: Record<string, string> = {
  '접수': 'bg-gray-100 text-gray-600', '내부확인': 'bg-blue-100 text-blue-700',
  '업체전달': 'bg-yellow-100 text-yellow-700', '협상': 'bg-orange-100 text-orange-700',
  '합의': 'bg-purple-100 text-purple-700', '완료': 'bg-green-100 text-green-700',
};
const issueColor: Record<string, string> = {
  '품질': 'bg-red-50 text-red-700', '수량': 'bg-orange-50 text-orange-700',
  '파손': 'bg-yellow-50 text-yellow-700', '지연': 'bg-blue-50 text-blue-700',
  '사양': 'bg-purple-50 text-purple-700', '기타': 'bg-gray-50 text-gray-600',
};

// ─── AutocompleteField ────────────────────────────────────────────────────────

function AutocompleteField({
  label, value, onChange, options, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string, id?: string) => void;
  options: { id: string; name: string; sub?: string }[]; placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value.length >= 1
    ? options.filter(o => o.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}{required && ' *'}</label>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder={placeholder}
        className="h-9"
      />
      {show && filtered.length > 0 && (
        <div className="absolute top-full left-0 z-50 w-full bg-background border border-border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filtered.map(o => (
            <button key={o.id} type="button"
              onClick={() => { onChange(o.name, o.id); setShow(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2">
              <span className="truncate">{o.name}</span>
              {o.sub && <span className="text-xs text-muted-foreground shrink-0">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileUploadSection ───────────────────────────────────────────────────────

interface FileEntry { url: string; originalName: string; fileType: string; size?: number; }

function FileUploadSection({
  claimId, imageFiles, reportFiles, onChangeImages, onChangeReports, disabled,
}: {
  claimId: string;
  imageFiles: FileEntry[]; reportFiles: FileEntry[];
  onChangeImages: (f: FileEntry[]) => void; onChangeReports: (f: FileEntry[]) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const rptRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, fileType: 'image' | 'report') => {
    setUploading(fileType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileType', fileType);
      const res = await fetch(`/api/claims/${claimId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || j.error) { alert(j.error || '업로드 실패'); return; }
      const entry: FileEntry = { url: j.url, originalName: j.originalName, fileType, size: j.size };
      if (fileType === 'image') onChangeImages([...imageFiles, entry]);
      else onChangeReports([...reportFiles, entry]);
    } catch (e) { alert('업로드 중 오류: ' + String(e)); }
    finally { setUploading(null); }
  };

  const removeImage = (idx: number) => onChangeImages(imageFiles.filter((_, i) => i !== idx));
  const removeReport = (idx: number) => onChangeReports(reportFiles.filter((_, i) => i !== idx));

  const isImg = (f: FileEntry) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalName || f.url);

  return (
    <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">첨부 파일</p>

      {/* Images */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Image className="w-3 h-3" /> 사진 ({imageFiles.length})</span>
          <button type="button" disabled={disabled || uploading === 'image'}
            onClick={() => imgRef.current?.click()}
            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-40">
            {uploading === 'image' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} 추가
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {imageFiles.map((f, i) => (
            <div key={i} className="relative group w-16 h-16 rounded-lg border overflow-hidden bg-muted/30">
              {isImg(f)
                ? <img src={f.url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>
              }
              <button type="button" onClick={() => removeImage(i)}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
        <input ref={imgRef} type="file" hidden accept="image/*,application/pdf" multiple
          onChange={e => { Array.from(e.target.files || []).forEach(f => upload(f, 'image')); e.target.value = ''; }} />
      </div>

      {/* Reports / Docs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Paperclip className="w-3 h-3" /> 문서/리포트 ({reportFiles.length})</span>
          <button type="button" disabled={disabled || uploading === 'report'}
            onClick={() => rptRef.current?.click()}
            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-40">
            {uploading === 'report' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} 추가
          </button>
        </div>
        <div className="space-y-1">
          {reportFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs bg-background border rounded px-2 py-1.5">
              <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{f.originalName}</span>
              </a>
              <button type="button" onClick={() => removeReport(i)} className="text-muted-foreground hover:text-red-500 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {reportFiles.length === 0 && <p className="text-xs text-muted-foreground">첨부된 문서 없음</p>}
        </div>
        <input ref={rptRef} type="file" hidden accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" multiple
          onChange={e => { Array.from(e.target.files || []).forEach(f => upload(f, 'report')); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ─── ClaimModal ───────────────────────────────────────────────────────────────

function ClaimModal({
  item, companies, products, purchaseOrders, sales, onClose, onSave,
}: {
  item?: Claim | null;
  companies: any[]; products: any[]; purchaseOrders: any[]; sales: any[];
  onClose: () => void; onSave: () => void;
}) {
  const cx = item as any;
  const claimId = item?.id || ('CLM-tmp-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [imageFiles, setImageFiles] = useState<FileEntry[]>(() => {
    const v = cx?.imageFiles; if (!v) return [];
    return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
  });
  const [reportFiles, setReportFiles] = useState<FileEntry[]>(() => {
    const v = cx?.reportFiles; if (!v) return [];
    return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
  });
  const [form, setForm] = useState({
    issueType: (item?.issueType || '품질') as string,
    status: (item?.status || '접수') as string,
    description: item?.description || '',
    customerName: item?.customerName || '',
    customerId: item?.customerId || '',
    supplierName: item?.supplierName || '',
    supplierId: item?.supplierId || '',
    productName: item?.productName || '',
    productId: item?.productId || '',
    poId: item?.poId || '',
    poBusinessId: item?.poBusinessId || '',
    saleId: cx?.saleId || '',
    saleBusinessId: cx?.saleBusinessId || '',
    claimAmount: item?.claimAmount ? String(item.claimAmount) : '',
    currency: item?.currency || 'USD',
    compensationType: (item?.compensationType || '차감') as string,
    compensationAmount: item?.compensationAmount ? String(item.compensationAmount) : '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Filter POs by selected supplier
  const supplierPOs = purchaseOrders.filter((po: any) =>
    !form.supplierId
      ? true
      : po.supplierId === form.supplierId || po.supplierName === form.supplierName
  );

  // Filter Sales by selected customer
  const customerSales = sales.filter((s: any) =>
    !form.customerId
      ? true
      : s.customerId === form.customerId || s.customer === form.customerName
  );

  const companyOptions = companies.map((c: any) => ({ id: c.id, name: c.name, sub: c.type }));
  const productOptions = products.map((p: any) => ({ id: p.id, name: p.nameKo, sub: p.code }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description) { setSaveError('설명을 입력해주세요.'); return; }
    setSaving(true); setSaveError('');
    try {
      const body = {
        ...form,
        claimAmount: form.claimAmount ? Number(form.claimAmount) : undefined,
        compensationAmount: form.compensationAmount ? Number(form.compensationAmount) : undefined,
        imageFiles,
        reportFiles,
      };
      const res = item
        ? await fetch(`/api/claims/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setSaveError(j.error || '저장 실패'); return; }
      onSave();
    } catch { setSaveError('네트워크 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[96vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <h2 className="font-semibold">{item ? '클레임 수정' : '클레임 등록'}</h2>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* Row 1: 이슈유형 / 상태 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">이슈유형</label>
              <select value={form.issueType} onChange={e => setForm(f => ({ ...f, issueType: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: 고객사 / 공급업체 */}
          <div className="grid grid-cols-2 gap-3">
            <AutocompleteField
              label="고객사"
              value={form.customerName}
              onChange={(v, id) => setForm(f => ({ ...f, customerName: v, customerId: id || '' }))}
              options={companyOptions}
              placeholder="거래처 검색..."
            />
            <AutocompleteField
              label="공급업체"
              value={form.supplierName}
              onChange={(v, id) => setForm(f => ({ ...f, supplierName: v, supplierId: id || '', poId: '', poBusinessId: '' }))}
              options={companyOptions}
              placeholder="공급업체 검색..."
            />
          </div>

          {/* Row 3: 제품명 */}
          <AutocompleteField
            label="제품명"
            value={form.productName}
            onChange={(v, id) => setForm(f => ({ ...f, productName: v, productId: id || '' }))}
            options={productOptions}
            placeholder="제품명 검색..."
          />

          {/* Row 4: 오더번호 / 매출번호 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">발주번호 (PO)</label>
              <select value={form.poId} onChange={e => {
                const po = supplierPOs.find((p: any) => p.id === e.target.value);
                setForm(f => ({ ...f, poId: e.target.value, poBusinessId: po?.businessId || '' }));
              }} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— 선택 안 함 —</option>
                {supplierPOs.map((po: any) => (
                  <option key={po.id} value={po.id}>{po.businessId} ({po.supplierName})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">매출번호 (CRM)</label>
              <select value={form.saleId} onChange={e => {
                const sale = customerSales.find((s: any) => s.id === e.target.value);
                setForm(f => ({ ...f, saleId: e.target.value, saleBusinessId: sale?.businessId || '' }));
              }} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— 선택 안 함 —</option>
                {customerSales.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.businessId} ({s.customer})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 5: 클레임금액 / 통화 / 처리방법 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">클레임금액</label>
              <Input type="number" value={form.claimAmount} onChange={e => setForm(f => ({ ...f, claimAmount: e.target.value }))} placeholder="0" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">처리방법</label>
              <select value={form.compensationType} onChange={e => setForm(f => ({ ...f, compensationType: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {COMPENSATION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Row 6: 보상금액 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">보상/처리금액</label>
            <Input type="number" value={form.compensationAmount} onChange={e => setForm(f => ({ ...f, compensationAmount: e.target.value }))} placeholder="실제 처리된 금액 (비워두면 클레임금액과 동일)" className="h-9" />
          </div>

          {/* Row 7: 설명 (큰 textarea) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">설명 *</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="클레임 내용을 상세히 기술해주세요. (발생 경위, 불량 내용, 영향 범위 등)"
              rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Row 8: 연결 문서 링크 표시 */}
          {(form.poBusinessId || form.saleBusinessId) && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">연결된 문서</p>
              <div className="flex flex-wrap gap-2">
                {form.poBusinessId && (
                  <Link href="/purchase-orders" className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded-md">
                    <FileText className="w-3 h-3" /> PO {form.poBusinessId}
                  </Link>
                )}
                {form.saleBusinessId && (
                  <Link href="/crm" className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:underline bg-green-50 px-2 py-1 rounded-md">
                    <ShoppingCart className="w-3 h-3" /> 매출 {form.saleBusinessId}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* 파일 업로드 */}
          <FileUploadSection
            claimId={claimId}
            imageFiles={imageFiles}
            reportFiles={reportFiles}
            onChangeImages={setImageFiles}
            onChangeReports={setReportFiles}
            disabled={saving}
          />

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정 저장' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClaimsPage() {
  const searchParams = useSearchParams();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: Claim | null }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, coRes, pRes, poRes, sRes] = await Promise.all([
      fetch('/api/claims').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/sales').then(r => r.json()),
    ]);
    if (cRes.data) setClaims(cRes.data);
    if (coRes.data) setCompanies(coRes.data);
    if (pRes.data) setProducts(pRes.data);
    if (poRes.data) setPurchaseOrders(poRes.data);
    if (sRes.data) setSales(sRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || loading) return;
    const found = claims.find(c => c.businessId === openId);
    if (found) setModal({ open: true, item: found });
  }, [loading, claims, searchParams]);

  const statuses = ['전체', ...STATUS_OPTIONS.filter(s => claims.some(c => c.status === s))];

  const filtered = claims.filter(c => {
    const ms = c.businessId.includes(search) || (c.customerName ?? '').includes(search) || (c.productName ?? '').includes(search) || (c.supplierName ?? '').includes(search);
    const mf = statusFilter === '전체' || c.status === statusFilter;
    return ms && mf;
  });

  const confirmDelete = async () => {
    await fetch(`/api/claims/${deleteConfirm.id}`, { method: 'DELETE' });
    setDeleteConfirm({ open: false, id: '' });
    load();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="클레임" />

      {modal.open && (
        <ClaimModal
          item={modal.item}
          companies={companies}
          products={products}
          purchaseOrders={purchaseOrders}
          sales={sales}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}

      {deleteConfirm.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold">클레임 삭제</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">이 클레임을 삭제하시겠습니까?</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm({ open: false, id: '' })}>취소</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete}>삭제</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="클레임번호, 제품명, 거래처 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {statuses.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                  statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                {s}
              </button>
            ))}
            <span className="text-xs text-muted-foreground hidden sm:block ml-1">{filtered.length}건</span>
            <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">클레임 등록</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['번호', '이슈유형', '제품', '고객사', '공급업체', '클레임금액', '처리방법', '연결', '상태', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(c => {
                    const cx = c as any;
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setModal({ open: true, item: c })}>
                        <td className="px-3 py-3 font-mono text-xs">{c.businessId}</td>
                        <td className="px-3 py-3">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', issueColor[c.issueType])}>{c.issueType}</span>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium max-w-[130px] truncate">{c.productName ?? '-'}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-[110px] truncate">{c.customerName ?? '-'}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-[110px] truncate">{c.supplierName ?? '-'}</td>
                        <td className="px-3 py-3 text-xs font-mono whitespace-nowrap">
                          {c.claimAmount ? `${c.currency ?? 'USD'} ${Number(c.claimAmount).toLocaleString()}` : '-'}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{c.compensationType ?? '-'}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {c.poBusinessId && (
                              <Link href="/purchase-orders" title={`발주 ${c.poBusinessId}`}
                                className="flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100">
                                <FileText className="w-2.5 h-2.5" /> PO
                              </Link>
                            )}
                            {cx.saleBusinessId && (
                              <Link href="/crm" title={`매출 ${cx.saleBusinessId}`}
                                className="flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded hover:bg-green-100">
                                <ShoppingCart className="w-2.5 h-2.5" /> 매출
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[c.status])}>{c.status}</span>
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setModal({ open: true, item: c })}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                              onClick={() => setDeleteConfirm({ open: true, id: c.id })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />클레임이 없습니다.
                </div>
              )}
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {filtered.map(c => {
                const cx = c as any;
                return (
                  <div key={c.id} className="bg-card border border-border rounded-xl p-4"
                    onClick={() => setModal({ open: true, item: c })}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">{c.businessId}</p>
                        <p className="font-semibold text-sm mt-0.5">{c.productName ?? '제품 미지정'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', issueColor[c.issueType])}>{c.issueType}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[c.status])}>{c.status}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{c.customerName || ''}</span>
                        {(c.poBusinessId || cx.saleBusinessId) && (
                          <span className="flex items-center gap-1">
                            {c.poBusinessId && <ExternalLink className="w-3 h-3 text-blue-500" />}
                            {cx.saleBusinessId && <ExternalLink className="w-3 h-3 text-green-500" />}
                          </span>
                        )}
                      </div>
                      {c.claimAmount && <span className="font-semibold">{c.currency ?? 'USD'} {Number(c.claimAmount).toLocaleString()}</span>}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">클레임이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
