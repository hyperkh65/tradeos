'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BadgeCheck, Plus, Loader2, Copy, Trash2, ChevronUp, ChevronDown, ArrowLeft, Link2, RefreshCw, Upload, Download, FileSpreadsheet, Gavel, AlertOctagon, Lock, Unlock, History, ScrollText } from 'lucide-react';

interface ProjectDetail {
  id: string; businessId: string; reportType: 'pre_approval' | 'pre_shipment';
  projectName: string; internalRefNo?: string; customerName?: string; supplierName?: string;
  manufacturerName?: string; productCategory?: string; productName?: string; baseModelName?: string;
  poNumber?: string; piNumber?: string; productionLotNo?: string;
  productionQty?: number; inspectionQty?: number; defectQty?: number;
  shipDate?: string; shippingDate?: string; requestDate?: string; dueDate?: string;
  internalContact?: string; supplierContact?: string; memo?: string;
  referenceProjectId?: string; defaultLanguage: string; status: string;
  createdByName?: string; createdAt: string;
  finalDecision?: string; decidedByName?: string; decidedAt?: string;
}

const FINAL_DECISION_OPTIONS: Record<string, string[]> = {
  pre_approval: ['승인', '조건부 승인', '수정 후 재제출', '부적합'],
  pre_shipment: ['출고 승인', '선적 승인', '조건부 출고 승인', '출고 보류', '부적합'],
};

interface ProductRow {
  id: string; projectId: string; sortOrder: number;
  productCategory?: string; productName?: string; modelName?: string;
  manufacturer?: string; productionLot?: string;
  dimensions?: string; weightG?: number; certNumber?: string; specText?: string; remark?: string;
  overallJudgement?: string; internalOpinion?: string;
}

const REPORT_TYPE_LABEL: Record<string, string> = { pre_approval: '사전승인서', pre_shipment: '출고선적승인서' };

export default function ApprovalInspectionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProject, setSavingProject] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  // 고객사/공급업체/제조업체/제품명/PO/PI 자동완성 목록
  const [customers, setCustomers] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [manufacturerNames, setManufacturerNames] = useState<string[]>([]);
  const [productNames, setProductNames] = useState<string[]>([]);
  const [posBySupplier, setPosBySupplier] = useState<Record<string, { businessId: string; piNumber?: string }[]>>({});

  useEffect(() => {
    fetch('/api/companies?type=고객사').then(r => r.json()).then(j => {
      if (Array.isArray(j.data)) setCustomers(j.data.map((c: { name: string }) => c.name));
    }).catch(() => {});
    fetch('/api/companies?type=공급업체').then(r => r.json()).then(j => {
      if (Array.isArray(j.data)) setSuppliers(j.data.map((c: { name: string }) => c.name));
    }).catch(() => {});
    fetch('/api/approval-inspection/suggestions').then(r => r.json()).then(j => {
      setManufacturerNames(j.data?.manufacturerNames || []);
      setProductNames(j.data?.productNames || []);
    }).catch(() => {});
  }, []);

  const loadPOsForSupplier = useCallback(async (supplierName: string) => {
    if (!supplierName || posBySupplier[supplierName]) return;
    try {
      const j = await fetch(`/api/purchase-orders?supplierName=${encodeURIComponent(supplierName)}`).then(r => r.json());
      if (Array.isArray(j.data)) setPosBySupplier(prev => ({ ...prev, [supplierName]: j.data }));
    } catch { /* ignore */ }
  }, [posBySupplier]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, prod] = await Promise.all([
        fetch(`/api/approval-inspection/${id}`).then(r => r.json()),
        fetch(`/api/approval-inspection/${id}/products`).then(r => r.json()),
      ]);
      setProject(pr.data ?? null);
      setProducts(prod.data ?? []);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (project?.supplierName) loadPOsForSupplier(project.supplierName);
  }, [project?.supplierName, loadPOsForSupplier]);

  const isClosed = project?.status === 'closed';

  const patchProject = async (patch: Partial<ProjectDetail>) => {
    setSavingProject(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '저장 실패'); return; }
      setProject(j.data);
    } finally { setSavingProject(false); }
  };

  const addProduct = async () => {
    setAddingProduct(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '추가 실패'); return; }
      setProducts(prev => [...prev, j.data]);
    } finally { setAddingProduct(false); }
  };

  const patchProduct = async (productId: string, patch: Partial<ProductRow>) => {
    setProducts(prev => prev.map(p => (p.id === productId ? { ...p, ...patch } : p)));
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '저장 실패'); load(); }
  };

  const duplicateProduct = async (productId: string) => {
    setBusyProductId(productId);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/duplicate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '복제 실패'); return; }
      setProducts(prev => [...prev, j.data]);
    } finally { setBusyProductId(null); }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('이 제품 블록을 삭제할까요? (측정항목/배선정보도 함께 삭제됩니다)')) return;
    setBusyProductId(productId);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products/${productId}`, { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '삭제 실패'); return; }
      setProducts(prev => prev.filter(p => p.id !== productId));
    } finally { setBusyProductId(null); }
  };

  const moveProduct = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= products.length) return;
    const reordered = [...products];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setProducts(reordered);
    const order = reordered.map(p => p.id);
    const r = await fetch(`/api/approval-inspection/${id}/products`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }),
    });
    if (!r.ok) load();
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="제품 승인검사" icon={<BadgeCheck className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="제품 승인검사" icon={<BadgeCheck className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`${REPORT_TYPE_LABEL[project.reportType]} — ${project.businessId}`} icon={<BadgeCheck className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6 max-w-4xl">
        <Link href="/approval-inspection" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />목록으로
        </Link>

        <StatusPanel id={id} status={project.status} onChanged={load} />

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">프로젝트 정보</h2>
            {savingProject && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {isClosed && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">마감된 프로젝트입니다. 수정하려면 먼저 마감을 해제하세요.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="프로젝트명" value={project.projectName} onBlurSave={v => patchProject({ projectName: v })} disabled={isClosed} />
            <Field label="내부 관리번호" value={project.internalRefNo} onBlurSave={v => patchProject({ internalRefNo: v })} disabled={isClosed} />
            <Field label="고객사" value={project.customerName} onBlurSave={v => patchProject({ customerName: v })} disabled={isClosed} listId="pd-customers" />
            <Field label="공급업체" value={project.supplierName} onBlurSave={v => { patchProject({ supplierName: v }); loadPOsForSupplier(v); }} disabled={isClosed} listId="pd-suppliers" />
            <Field label="제조업체" value={project.manufacturerName} onBlurSave={v => patchProject({ manufacturerName: v })} disabled={isClosed} listId="pd-manufacturers" />
            <Field label="기본 모델명" value={project.baseModelName} onBlurSave={v => patchProject({ baseModelName: v })} disabled={isClosed} />
            <Field label="PO 번호" value={project.poNumber} onBlurSave={v => patchProject({ poNumber: v })} disabled={isClosed} listId="pd-pos" onFocus={() => loadPOsForSupplier(project.supplierName || '')} />
            <Field label="PI 번호" value={project.piNumber} onBlurSave={v => patchProject({ piNumber: v })} disabled={isClosed} listId="pd-pis" onFocus={() => loadPOsForSupplier(project.supplierName || '')} />
            <Field label="생산 LOT 번호" value={project.productionLotNo} onBlurSave={v => patchProject({ productionLotNo: v })} disabled={isClosed} />
            <Field label="제출기한" type="date" value={project.dueDate} onBlurSave={v => patchProject({ dueDate: v })} disabled={isClosed} />
            <Field label="생산수량" type="number" value={project.productionQty} onBlurSave={v => patchProject({ productionQty: v ? Number(v) : undefined })} disabled={isClosed} />
            <Field label="검사수량" type="number" value={project.inspectionQty} onBlurSave={v => patchProject({ inspectionQty: v ? Number(v) : undefined })} disabled={isClosed} />
            <Field label="불량수량" type="number" value={project.defectQty} onBlurSave={v => patchProject({ defectQty: v ? Number(v) : undefined })} disabled={isClosed} />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">불량율</label>
              <div className="h-10 rounded-lg border border-input bg-muted/30 px-3 flex items-center text-sm text-muted-foreground">
                {project.inspectionQty ? `${((project.defectQty ?? 0) / project.inspectionQty * 100).toFixed(2)}%` : '-'}
              </div>
            </div>
          </div>
          <datalist id="pd-customers">{customers.map(c => <option key={c} value={c} />)}</datalist>
          <datalist id="pd-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
          <datalist id="pd-manufacturers">{manufacturerNames.map(m => <option key={m} value={m} />)}</datalist>
          <datalist id="pd-products">{productNames.map(p => <option key={p} value={p} />)}</datalist>
          <datalist id="pd-pos">{(posBySupplier[project.supplierName || ''] || []).map(p => <option key={p.businessId} value={p.businessId} />)}</datalist>
          <datalist id="pd-pis">{(posBySupplier[project.supplierName || ''] || []).filter(p => p.piNumber).map(p => <option key={p.businessId} value={p.piNumber} />)}</datalist>
        </div>

        <LinkPanel id={id} disabled={isClosed} />

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">제품 블록 ({products.length})</h2>
            <Button size="sm" onClick={addProduct} disabled={addingProduct || isClosed} className="gap-1.5">
              {addingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}제품 추가
            </Button>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">등록된 제품이 없습니다. &quot;제품 추가&quot;로 시작하세요.</p>
          ) : (
            <div className="space-y-3">
              {products.map((p, idx) => (
                <div key={p.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">제품 {idx + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveProduct(idx, -1)} disabled={idx === 0 || isClosed} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveProduct(idx, 1)} disabled={idx === products.length - 1 || isClosed} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => duplicateProduct(p.id)} disabled={busyProductId === p.id || isClosed} className="p-1 rounded hover:bg-muted disabled:opacity-30" title="복제"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => deleteProduct(p.id)} disabled={busyProductId === p.id || isClosed} className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-30" title="삭제"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="제품 구분" value={p.productCategory} onBlurSave={v => patchProduct(p.id, { productCategory: v })} disabled={isClosed} />
                    <Field label="제품명" value={p.productName} onBlurSave={v => patchProduct(p.id, { productName: v })} disabled={isClosed} listId="pd-products" />
                    <Field label="모델명" value={p.modelName} onBlurSave={v => patchProduct(p.id, { modelName: v })} disabled={isClosed} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="생산 LOT" value={p.productionLot} onBlurSave={v => patchProduct(p.id, { productionLot: v })} disabled={isClosed} />
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">스펙</label>
                      <textarea
                        className="w-full min-h-[38px] text-sm rounded-lg border border-input bg-transparent px-3 py-1.5 disabled:opacity-50"
                        disabled={isClosed}
                        defaultValue={p.specText ?? ''}
                        onBlur={e => { if (e.target.value !== (p.specText ?? '')) patchProduct(p.id, { specText: e.target.value }); }}
                      />
                    </div>
                  </div>
                  <Link href={`/approval-inspection/${id}/products/${p.id}`} className="text-xs text-primary hover:underline inline-block pt-1">
                    측정값/배선/사진 입력 →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <RevisionRequestsPanel id={id} products={products} disabled={isClosed} />
        <DecisionPanel id={id} reportType={project.reportType} finalDecision={project.finalDecision} decidedByName={project.decidedByName} decidedAt={project.decidedAt} disabled={isClosed} onDecided={load} />
        <ImportExportPanel id={id} disabled={isClosed} onImported={load} />
        <GenerateDocPanel id={id} hasProducts={products.length > 0} />
        <HistoryPanel id={id} />
      </div>
    </div>
  );
}

function ImportExportPanel({ id, disabled, onImported }: { id: string; disabled: boolean; onImported: () => void }) {
  const [importing, setImporting] = useState(false);

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/approval-inspection/${id}/import-xlsx`, { method: 'POST', body: formData });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '가져오기 실패'); return; }
      alert(`${j.data.importedCount}개 제품을 가져왔습니다.${j.data.warnings?.length ? `\n${j.data.warnings.join('\n')}` : ''}`);
      onImported();
    } finally { setImporting(false); }
  };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-2">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" />XLSX 가져오기/내보내기</h2>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {!disabled && (
          <label className="text-primary hover:underline flex items-center gap-1 cursor-pointer">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}참고 엑셀에서 가져오기
            <input type="file" accept=".xlsx" className="hidden" disabled={importing} onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
        )}
        <a href={`/api/approval-inspection/${id}/download/blank-template`} className="text-primary hover:underline flex items-center gap-1"><Download className="w-3.5 h-3.5" />빈 양식 다운로드</a>
        <a href={`/api/approval-inspection/${id}/download/current-data`} className="text-primary hover:underline flex items-center gap-1"><Download className="w-3.5 h-3.5" />현재 데이터 다운로드</a>
      </div>
    </div>
  );
}

function GenerateDocPanel({ id, hasProducts }: { id: string; hasProducts: boolean }) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ hasPdf: boolean; warning: string | null } | null>(null);

  const generate = async () => {
    setGenerating(true);
    setResult(null);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '생성 실패'); return; }
      setResult({ hasPdf: j.data.hasPdf, warning: j.data.warning });
    } finally { setGenerating(false); }
  };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">문서 생성</h2>
        <Button size="sm" onClick={generate} disabled={generating || !hasProducts} className="gap-1.5">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}DOCX/XLSX/PDF 생성
        </Button>
      </div>
      {!hasProducts && <p className="text-xs text-muted-foreground">제품 블록을 먼저 추가하세요.</p>}
      {result && (
        <div className="space-y-2">
          {result.warning && <p className="text-xs text-amber-600">{result.warning}</p>}
          <div className="flex gap-3 text-xs">
            <a href={`/api/approval-inspection/${id}/download/docx`} className="text-primary hover:underline">DOCX 다운로드</a>
            <a href={`/api/approval-inspection/${id}/download/xlsx`} className="text-primary hover:underline">XLSX 다운로드</a>
            {result.hasPdf && <a href={`/api/approval-inspection/${id}/download/pdf`} className="text-primary hover:underline">PDF 다운로드</a>}
            <a href={`/api/approval-inspection/${id}/download/zip`} className="text-primary hover:underline">전체 패키지(ZIP) 다운로드</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onBlurSave, disabled, type = 'text', listId, onFocus }: {
  label: string; value?: string | number; onBlurSave: (v: string) => void; disabled?: boolean; type?: string; listId?: string; onFocus?: () => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input
        type={type}
        list={listId}
        value={local}
        disabled={disabled}
        onChange={e => setLocal(e.target.value)}
        onFocus={onFocus}
        onBlur={() => { if (local !== (value != null ? String(value) : '')) onBlurSave(local); }}
      />
    </div>
  );
}

function LinkPanel({ id, disabled }: { id: string; disabled: boolean }) {
  const [link, setLink] = useState<{ hasActiveLink: boolean; createdAt: string | null; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/approval-inspection/${id}/link`).then(r => r.json()).then(j => setLink(j.data ?? null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (link?.hasActiveLink && !confirm('기존 링크는 비활성화되고 새 링크가 발급됩니다. 계속할까요?')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: link?.hasActiveLink ? '재발급' : undefined }) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '발급 실패'); return; }
      await load();
      if (j.data?.url) { navigator.clipboard?.writeText(j.data.url).catch(() => {}); alert('링크가 발급되어 클립보드에 복사되었습니다.'); }
    } finally { setBusy(false); }
  };

  const copy = () => { if (link?.url) { navigator.clipboard?.writeText(link.url).catch(() => {}); alert('클립보드에 복사되었습니다.'); } };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-2">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><Link2 className="w-4 h-4" />외부 작성 링크</h2>
      {!link ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : link.hasActiveLink && link.url ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">{link.url}</code>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0"><Copy className="w-3.5 h-3.5" />복사</Button>
          <Button size="sm" variant="outline" onClick={generate} disabled={busy || disabled} className="gap-1.5 shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}재발급
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={generate} disabled={busy || disabled} className="gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}링크 발급
        </Button>
      )}
    </div>
  );
}

function DecisionPanel({ id, reportType, finalDecision, decidedByName, decidedAt, disabled, onDecided }: {
  id: string; reportType: string; finalDecision?: string; decidedByName?: string; decidedAt?: string; disabled: boolean; onDecided: () => void;
}) {
  const [selected, setSelected] = useState(finalDecision ?? '');
  const [saving, setSaving] = useState(false);
  const options = FINAL_DECISION_OPTIONS[reportType] || [];

  useEffect(() => { setSelected(finalDecision ?? ''); }, [finalDecision]);

  const decide = async () => {
    if (!selected) { alert('판정을 선택하세요.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalDecision: selected }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '결재 실패'); return; }
      onDecided();
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-2">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><Gavel className="w-4 h-4" />결재 (§15)</h2>
      {finalDecision && (
        <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1.5">
          최종 판정: <span className="font-semibold">{finalDecision}</span>
          {decidedByName && ` — ${decidedByName}${decidedAt ? ` (${decidedAt.slice(0, 10)})` : ''}`}
        </p>
      )}
      {!disabled && (
        <div className="flex items-center gap-2">
          <select value={selected} onChange={e => setSelected(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">판정 선택...</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <Button size="sm" onClick={decide} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}결재</Button>
        </div>
      )}
    </div>
  );
}

interface RevisionRequestRow {
  id: string; productId?: string; targetField?: string; requestContent: string; requestedByName?: string;
  requestedAt: string; supplierResponse?: string; status: string;
}

function RevisionRequestsPanel({ id, products, disabled }: { id: string; products: ProductRow[]; disabled: boolean }) {
  const [requests, setRequests] = useState<RevisionRequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState('');
  const [targetProductId, setTargetProductId] = useState('');

  const load = useCallback(() => {
    fetch(`/api/approval-inspection/${id}/revision-requests`).then(r => r.json()).then(j => { setRequests(j.data ?? []); setLoaded(true); });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!content.trim()) { alert('요청 내용을 입력하세요.'); return; }
    setCreating(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/revision-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestContent: content.trim(), productId: targetProductId || undefined }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '요청 실패'); return; }
      setContent(''); setTargetProductId('');
      load();
    } finally { setCreating(false); }
  };

  const resolve = async (requestId: string) => {
    const r = await fetch(`/api/approval-inspection/${id}/revision-requests/${requestId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }),
    });
    if (r.ok) load();
  };

  const openCount = requests.filter(r => r.status === 'open').length;

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><AlertOctagon className="w-4 h-4" />수정요청 (§16){openCount > 0 && <span className="text-amber-600">({openCount}건 대기)</span>}</h2>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={targetProductId} onChange={e => setTargetProductId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">(제품 미지정)</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.productName || p.modelName || p.id}</option>)}
          </select>
          <Input className="flex-1 min-w-[200px]" placeholder="수정요청 내용" value={content} onChange={e => setContent(e.target.value)} />
          <Button size="sm" onClick={create} disabled={creating} className="gap-1.5">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}요청</Button>
        </div>
      )}
      {loaded && requests.length === 0 && <p className="text-xs text-muted-foreground">등록된 수정요청이 없습니다.</p>}
      <div className="space-y-1.5">
        {requests.map(r => (
          <div key={r.id} className={`rounded-md px-3 py-2 text-xs ${r.status === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-muted/40 text-muted-foreground'}`}>
            <div className="flex items-center justify-between">
              <span>{r.requestContent}</span>
              {r.status === 'open' && !disabled && <button onClick={() => resolve(r.id)} className="underline shrink-0 ml-2">완료 처리</button>}
            </div>
            <p className="mt-0.5">{r.requestedByName} · {r.requestedAt?.slice(0, 10)} · {r.status === 'open' ? '대기중' : r.status === 'resolved' ? '완료' : '취소됨'}</p>
            {r.supplierResponse && <p className="mt-1 text-foreground">공급업체 응답: {r.supplierResponse}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: '작성중', submitted: '제출됨', revision_requested: '수정요청', revising: '수정중',
  resubmitted: '재제출됨', internal_review: '내부 검토중', approved: '승인됨',
  conditional_approval: '조건부 승인', shipment_hold: '출고 보류', closed: '마감됨',
};
const MANUAL_STATUS_OPTIONS = ['internal_review', 'approved', 'conditional_approval', 'shipment_hold', 'revising'];

function StatusPanel({ id, status, onChanged }: { id: string; status: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [manualStatus, setManualStatus] = useState('');
  const isClosed = status === 'closed';

  const changeStatus = async () => {
    if (!manualStatus) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: manualStatus }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '상태 변경 실패'); return; }
      setManualStatus('');
      onChanged();
    } finally { setBusy(false); }
  };

  const closeOrReopen = async (action: 'close' | 'reopen') => {
    const reason = prompt(action === 'close' ? '마감 사유(선택)' : '마감해제 사유(선택)') || undefined;
    if (action === 'close' && !confirm('마감하면 모든 입력이 잠깁니다. 계속할까요?')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '처리 실패'); return; }
      onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-card border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">상태</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isClosed ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{STATUS_LABEL[status] || status}</span>
      </div>
      <div className="flex items-center gap-2">
        {!isClosed && (
          <>
            <select value={manualStatus} onChange={e => setManualStatus(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">내부 검토 상태 변경...</option>
              {MANUAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={changeStatus} disabled={busy || !manualStatus} className="h-8 text-xs">적용</Button>
            <Button size="sm" variant="outline" onClick={() => closeOrReopen('close')} disabled={busy} className="h-8 text-xs gap-1"><Lock className="w-3.5 h-3.5" />마감</Button>
          </>
        )}
        {isClosed && (
          <Button size="sm" variant="outline" onClick={() => closeOrReopen('reopen')} disabled={busy} className="h-8 text-xs gap-1"><Unlock className="w-3.5 h-3.5" />마감해제</Button>
        )}
      </div>
    </div>
  );
}

interface SubmissionVersionRow { id: string; versionNo: number; submittedAt: string; submittedByName?: string; statusAtSubmission?: string }
interface AuditLogRow { id: string; action: string; actorType: string; actorUserName?: string; createdAt: string }

function HistoryPanel({ id }: { id: string }) {
  const [versions, setVersions] = useState<SubmissionVersionRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/approval-inspection/${id}/submission-versions`).then(r => r.json()),
      fetch(`/api/approval-inspection/${id}/audit`).then(r => r.json()),
    ]).then(([v, a]) => { setVersions(v.data ?? []); setLogs(a.data ?? []); });
  }, [id]);
  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-1.5"><History className="w-4 h-4" />제출이력 / 감사로그</h2>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">제출 버전</h3>
            {versions.length === 0 ? <p className="text-xs text-muted-foreground">제출 이력이 없습니다.</p> : (
              <div className="space-y-1">
                {versions.map(v => (
                  <div key={v.id} className="text-xs flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                    <span>v{v.versionNo} — {v.submittedByName || '-'}</span>
                    <span className="text-muted-foreground">{v.submittedAt?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><ScrollText className="w-3.5 h-3.5" />감사로그 (최근 200건)</h3>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {logs.map(l => (
                <div key={l.id} className="text-xs flex items-center justify-between">
                  <span>{l.action} <span className="text-muted-foreground">({l.actorType === 'internal' ? l.actorUserName || '내부' : '외부'})</span></span>
                  <span className="text-muted-foreground shrink-0 ml-2">{l.createdAt?.slice(0, 16).replace('T', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
