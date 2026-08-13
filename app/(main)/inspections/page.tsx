'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Search, X, Loader2, Pencil, Trash2, FileText, Image, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import type { Inspection } from '@/types';

const INSPECTION_TYPES = ['공장검품', '입고검품', '선적전검품', '도입전 샘플 검품'];
const RESULTS: { value: string; label: string; style: string }[] = [
  { value: 'PENDING', label: '판정대기', style: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'PASS', label: '합격', style: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  { value: 'FAIL', label: '불합격', style: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { value: 'RETEST', label: '재시험', style: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
];
const STATUSES: { value: string; label: string; style: string }[] = [
  { value: 'scheduled', label: '예정', style: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300' },
  { value: 'in_progress', label: '진행중', style: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300' },
  { value: 'completed', label: '완료', style: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  { value: 'on_hold', label: '보류', style: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
];

function resultInfo(r: string) { return RESULTS.find(x => x.value === r) ?? RESULTS[0]; }
function statusInfo(s: string) { return STATUSES.find(x => x.value === s) ?? STATUSES[0]; }

/* ─── Inspection Modal ──────────────────────────────────────────────────────── */

function InspectionModal({ inspection, companies, products, purchaseOrders, onClose, onSave }: {
  inspection?: Inspection | null;
  companies: any[]; products: any[]; purchaseOrders: any[];
  onClose: () => void; onSave: () => void;
}) {
  const isSample = (t: string) => t === '도입전 샘플 검품';

  const [form, setForm] = useState({
    supplierName: inspection?.supplierName || '',
    productId: inspection?.productId || '',
    productName: inspection?.productName || '',
    productNameManual: inspection?.productNameManual || '',
    useManualProduct: !inspection?.productId && !!inspection?.productNameManual,
    poId: inspection?.poId || '',
    poBusinessId: inspection?.poBusinessId || '',
    inspectionType: inspection?.inspectionType || '공장검품',
    inspectionDate: inspection?.inspectionDate || new Date().toISOString().slice(0, 10),
    inspector: inspection?.inspector || '',
    sampleQty: String(inspection?.sampleQty ?? ''),
    checkedQty: String(inspection?.checkedQty ?? ''),
    failedQty: String(inspection?.failedQty ?? ''),
    result: (inspection?.result || 'PENDING') as string,
    status: (inspection?.status || 'scheduled') as string,
    summary: inspection?.summary || '',
    opinion: inspection?.opinion || '',
  });

  const [pendingReports, setPendingReports] = useState<File[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [existingReports, setExistingReports] = useState<string[]>(inspection?.reportFiles || []);
  const [existingImages, setExistingImages] = useState<string[]>(inspection?.imageFiles || []);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const reportRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const filteredPOs = purchaseOrders.filter(po => !form.supplierName || po.supplierName === form.supplierName);

  const checkedQtyNum = Number(form.checkedQty) || 0;
  const failedQtyNum = Number(form.failedQty) || 0;
  const defectRate = checkedQtyNum > 0 ? ((failedQtyNum / checkedQtyNum) * 100).toFixed(2) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName) return;
    if (!isSample(form.inspectionType) && !form.productName) return;

    setSaving(true);
    try {
      const finalProductName = isSample(form.inspectionType) && form.useManualProduct
        ? form.productNameManual
        : form.productName;

      const body = {
        supplierName: form.supplierName,
        productId: form.productId || null,
        productName: finalProductName,
        productNameManual: (isSample(form.inspectionType) && form.useManualProduct) ? form.productNameManual : null,
        poId: form.poId || null,
        poBusinessId: form.poBusinessId || null,
        inspectionType: form.inspectionType,
        inspectionDate: form.inspectionDate,
        inspector: form.inspector || null,
        sampleQty: Number(form.sampleQty) || 0,
        checkedQty: form.checkedQty ? Number(form.checkedQty) : null,
        failedQty: form.failedQty ? Number(form.failedQty) : null,
        result: form.result,
        status: form.status,
        summary: form.summary || null,
        opinion: form.opinion || null,
        reportFiles: existingReports,
        imageFiles: existingImages,
      };

      const url = inspection ? `/api/inspections/${inspection.id}` : '/api/inspections';
      const res = await fetch(url, { method: inspection ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.data) throw new Error('저장 실패');

      const inspId = json.data.id;
      const newReportUrls = [...existingReports];
      const newImageUrls = [...existingImages];

      // Upload reports
      for (let i = 0; i < pendingReports.length; i++) {
        setUploadProgress(`리포트 업로드 ${i + 1}/${pendingReports.length}...`);
        const fd = new FormData();
        fd.append('file', pendingReports[i]);
        fd.append('fileType', 'report');
        const r = await fetch(`/api/inspections/${inspId}/upload`, { method: 'POST', body: fd });
        const j = await r.json();
        if (j.url) newReportUrls.push(j.url);
      }

      // Upload images
      for (let i = 0; i < pendingImages.length; i++) {
        setUploadProgress(`사진 업로드 ${i + 1}/${pendingImages.length}...`);
        const fd = new FormData();
        fd.append('file', pendingImages[i]);
        fd.append('fileType', 'image');
        const r = await fetch(`/api/inspections/${inspId}/upload`, { method: 'POST', body: fd });
        const j = await r.json();
        if (j.url) newImageUrls.push(j.url);
      }

      // Update with file URLs if any
      if (pendingReports.length > 0 || pendingImages.length > 0) {
        setUploadProgress('파일 정보 저장 중...');
        await fetch(`/api/inspections/${inspId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportFiles: newReportUrls, imageFiles: newImageUrls }),
        });
      }

      onSave();
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  const removeExistingReport = (url: string) => setExistingReports(prev => prev.filter(u => u !== url));
  const removeExistingImage = (url: string) => setExistingImages(prev => prev.filter(u => u !== url));
  const removePendingReport = (i: number) => setPendingReports(prev => prev.filter((_, idx) => idx !== i));
  const removePendingImage = (i: number) => setPendingImages(prev => prev.filter((_, idx) => idx !== i));

  const fileBasename = (url: string) => {
    const parts = url.split('/');
    return parts[parts.length - 1];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{inspection ? '검품 수정' : '검품 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* 공급업체 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체 *</label>
            <Input value={form.supplierName} onChange={e => { setForm(f => ({ ...f, supplierName: e.target.value, poBusinessId: '', poId: '' })); }}
              list="insp-supplier-list" placeholder="공급업체 입력..." required />
            <datalist id="insp-supplier-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
          </div>

          {/* 검품유형 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">검품유형</label>
            <div className="flex flex-wrap gap-2">
              {INSPECTION_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, inspectionType: t }))}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    form.inspectionType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted/50')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 도입전 샘플 검품 안내 */}
          {isSample(form.inspectionType) && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold"><Info className="w-3.5 h-3.5 shrink-0" /> 도입전 샘플 검품 안내</div>
              <p>아직 제품 코드가 없는 샘플의 경우, 제품명을 직접 입력할 수 있습니다.</p>
              <p className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                향후 제품이 정식 등록되면 반드시 제품명을 등록된 제품으로 선택하여 업데이트해 주세요.
              </p>
            </div>
          )}

          {/* 제품명 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">
                제품명 {isSample(form.inspectionType) ? '(선택)' : '*'}
              </label>
              {isSample(form.inspectionType) && (
                <button type="button" className="text-[10px] text-blue-500 hover:underline"
                  onClick={() => setForm(f => ({ ...f, useManualProduct: !f.useManualProduct, productId: '', productName: '' }))}>
                  {form.useManualProduct ? '▶ 등록 제품에서 선택' : '▶ 수기 입력'}
                </button>
              )}
            </div>
            {(isSample(form.inspectionType) && form.useManualProduct) ? (
              <Input value={form.productNameManual} onChange={e => setForm(f => ({ ...f, productNameManual: e.target.value }))}
                placeholder="제품명 직접 입력 (샘플/미등록 제품)" />
            ) : (
              <>
                <Input value={form.productName} onChange={e => { setForm(f => ({ ...f, productName: e.target.value, productId: '' })); }}
                  list="insp-product-list" placeholder="제품명 선택 또는 입력..."
                  required={!isSample(form.inspectionType)} />
                <datalist id="insp-product-list">
                  {products.map(p => <option key={p.id} value={p.nameKo}>{p.code ? ` (${p.code})` : ''}</option>)}
                </datalist>
              </>
            )}
          </div>

          {/* 발주번호 + 검품일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                발주번호 <span className="text-muted-foreground/60 font-normal">(선택)</span>
              </label>
              <select value={form.poBusinessId}
                onChange={e => {
                  const po = purchaseOrders.find(p => p.businessId === e.target.value);
                  setForm(f => ({ ...f, poBusinessId: e.target.value, poId: po?.id || '' }));
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- 선택 안함 --</option>
                {filteredPOs.map(po => (
                  <option key={po.id} value={po.businessId}>{po.businessId} | {po.supplierName}</option>
                ))}
              </select>
              {form.supplierName && filteredPOs.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">해당 공급업체의 발주가 없습니다</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">검품일</label>
              <Input type="date" value={form.inspectionDate} onChange={e => setForm(f => ({ ...f, inspectionDate: e.target.value }))} />
            </div>
          </div>

          {/* 수량 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">샘플 수량</label>
              <Input type="number" min="0" value={form.sampleQty} onChange={e => setForm(f => ({ ...f, sampleQty: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">검품 수량</label>
              <Input type="number" min="0" value={form.checkedQty} onChange={e => setForm(f => ({ ...f, checkedQty: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">불량 수량</label>
              <Input type="number" min="0" value={form.failedQty} onChange={e => setForm(f => ({ ...f, failedQty: e.target.value }))} placeholder="0" />
              {defectRate !== null && <p className="text-[10px] text-muted-foreground mt-0.5">불량률 {defectRate}%</p>}
            </div>
          </div>

          {/* 결과 + 상태 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">검품 결과</label>
              <div className="flex gap-1.5 flex-wrap">
                {RESULTS.map(r => (
                  <button key={r.value} type="button"
                    onClick={() => setForm(f => ({ ...f, result: r.value }))}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                      form.result === r.value ? r.style + ' ring-2 ring-offset-1 ring-current' : 'border-border text-muted-foreground hover:bg-muted/50')}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">진행 상태</label>
              <div className="flex gap-1.5 flex-wrap">
                {STATUSES.map(s => (
                  <button key={s.value} type="button"
                    onClick={() => setForm(f => ({ ...f, status: s.value }))}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                      form.status === s.value ? s.style + ' ring-2 ring-offset-1 ring-current' : 'border-border text-muted-foreground hover:bg-muted/50')}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 검품자 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">검품자</label>
            <Input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} placeholder="검품 담당자 이름" />
          </div>

          {/* 검품 요약 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">검품 요약 (한 줄)</label>
            <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="검품 결과 요약 (목록에 표시됨)" />
          </div>

          {/* 검품자 의견 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">검품자 의견 · 상세 내용</label>
            <textarea value={form.opinion} onChange={e => setForm(f => ({ ...f, opinion: e.target.value }))}
              rows={5} placeholder="검품 상세 의견, 불량 내역, 조치 사항 등을 자유롭게 작성하세요..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {/* 테스트 리포트 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> 테스트 리포트</label>
              <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => reportRef.current?.click()}>
                <Plus className="w-3 h-3" /> 파일 추가
              </button>
              <input ref={reportRef} type="file" className="hidden" multiple
                accept=".pdf,.xlsx,.xls,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg"
                onChange={e => { if (e.target.files) setPendingReports(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ''; }} />
            </div>
            <div className="space-y-1">
              {existingReports.map((url, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate mr-2">{fileBasename(url)}</a>
                  <button type="button" onClick={() => removeExistingReport(url)}><X className="w-3 h-3 text-muted-foreground hover:text-red-500" /></button>
                </div>
              ))}
              {pendingReports.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950/20 rounded px-2 py-1.5">
                  <span className="text-blue-600 truncate mr-2">{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)}KB)</span></span>
                  <button type="button" onClick={() => removePendingReport(i)}><X className="w-3 h-3 text-muted-foreground hover:text-red-500" /></button>
                </div>
              ))}
              {existingReports.length === 0 && pendingReports.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-2 border border-dashed rounded">리포트 파일 없음</div>
              )}
            </div>
          </div>

          {/* 사진 첨부 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> 검품 사진</label>
              <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => imageRef.current?.click()}>
                <Plus className="w-3 h-3" /> 사진 추가
              </button>
              <input ref={imageRef} type="file" className="hidden" multiple accept="image/*"
                onChange={e => { if (e.target.files) setPendingImages(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ''; }} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {existingImages.map((url, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeExistingImage(url)}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {pendingImages.map((f, i) => {
                const preview = URL.createObjectURL(f);
                return (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="" className="w-full h-full object-cover" onLoad={() => URL.revokeObjectURL(preview)} />
                    <button type="button" onClick={() => removePendingImage(i)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                );
              })}
              {existingImages.length === 0 && pendingImages.length === 0 && (
                <div className="col-span-4 text-xs text-muted-foreground text-center py-3 border border-dashed rounded">사진 없음</div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgress || '저장 중...'}
                </span>
              ) : (inspection ? '수정 저장' : '검품 등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; inspection?: Inspection | null }>({ open: false });

  const safeFetch = async (url: string, fallback: object) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [iRes, cRes, pRes, poRes] = await Promise.all([
        safeFetch('/api/inspections', { data: [] }),
        safeFetch('/api/companies', { data: [] }),
        safeFetch('/api/products', { data: [] }),
        safeFetch('/api/purchase-orders', { data: [] }),
      ]);
      setInspections(Array.isArray(iRes.data) ? iRes.data : []);
      setCompanies(Array.isArray(cRes.data) ? cRes.data : []);
      setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      setPurchaseOrders(Array.isArray(poRes.data) ? poRes.data : []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('이 검품 기록을 삭제하시겠습니까?')) return;
    await fetch(`/api/inspections/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = inspections.filter(q =>
    q.businessId.toLowerCase().includes(search.toLowerCase()) ||
    q.productName.toLowerCase().includes(search.toLowerCase()) ||
    q.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    (q.inspector ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="검품" />
      {modal.open && (
        <InspectionModal
          inspection={modal.inspection}
          companies={companies} products={products} purchaseOrders={purchaseOrders}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="검품번호, 제품명, 공급업체 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, inspection: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">검품 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    {['검품번호', '공급업체', '제품명', '발주', '검품일', '검품유형', '샘플/검품/불량', '결과', '상태', '관리'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                      <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />검품 내역이 없습니다.
                    </td></tr>
                  ) : filtered.map(qc => {
                    const ri = resultInfo(qc.result);
                    const si = statusInfo(qc.status);
                    const displayName = qc.productNameManual || qc.productName;
                    return (
                      <tr key={qc.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{qc.businessId}</td>
                        <td className="px-3 py-3 text-xs max-w-[120px] truncate">{qc.supplierName}</td>
                        <td className="px-3 py-3 text-sm font-medium max-w-[180px]">
                          <div className="truncate">{displayName}</div>
                          {qc.productNameManual && <div className="text-[10px] text-orange-500">수기 입력</div>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{qc.poBusinessId || '-'}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{qc.inspectionDate}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px]',
                            qc.inspectionType === '도입전 샘플 검품' ? 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300' : 'bg-muted text-muted-foreground')}>
                            {qc.inspectionType}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {(qc.checkedQty ?? 0) > 0
                            ? <><span className="text-muted-foreground">{qc.sampleQty}</span> / <span className="font-medium">{qc.checkedQty}</span> / <span className="text-red-600 font-medium">{qc.failedQty ?? 0}</span>{qc.defectRate !== undefined && <span className="text-muted-foreground ml-1">({qc.defectRate}%)</span>}</>
                            : <span className="text-muted-foreground">{qc.sampleQty} / - / -</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', ri.style)}>{ri.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', si.style)}>{si.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setModal({ open: true, inspection: qc })}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                              onClick={() => handleDelete(qc.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(qc => {
                const ri = resultInfo(qc.result);
                const si = statusInfo(qc.status);
                const displayName = qc.productNameManual || qc.productName;
                return (
                  <div key={qc.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-muted-foreground">{qc.businessId}</p>
                        <p className="font-semibold text-sm mt-0.5 truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{qc.supplierName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', ri.style)}>{ri.label}</span>
                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full', si.style)}>{si.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span>{qc.inspectionDate}</span>
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{qc.inspectionType}</span>
                      {(qc.checkedQty ?? 0) > 0 && (
                        <span>검품 {qc.checkedQty} / 불량 <span className="text-red-600 font-medium">{qc.failedQty ?? 0}</span></span>
                      )}
                    </div>
                    {qc.summary && <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 mb-2">{qc.summary}</p>}
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => setModal({ open: true, inspection: qc })}>
                        <Pencil className="w-3 h-3 mr-1" /> 수정
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                        onClick={() => handleDelete(qc.id)}>
                        <Trash2 className="w-3 h-3 mr-1" /> 삭제
                      </Button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">검품 내역이 없습니다.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
