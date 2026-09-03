'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BadgeCheck, Plus, Loader2, Copy, Trash2, ChevronUp, ChevronDown, ArrowLeft, Link2, RefreshCw, Upload, Download, FileSpreadsheet } from 'lucide-react';

interface ProjectDetail {
  id: string; businessId: string; reportType: 'pre_approval' | 'pre_shipment';
  projectName: string; internalRefNo?: string; customerName?: string; supplierName?: string;
  manufacturerName?: string; productCategory?: string; productName?: string; baseModelName?: string;
  poNumber?: string; piNumber?: string; productionLotNo?: string;
  productionQty?: number; inspectionQty?: number;
  shipDate?: string; shippingDate?: string; requestDate?: string; dueDate?: string;
  internalContact?: string; supplierContact?: string; memo?: string;
  referenceProjectId?: string; defaultLanguage: string; status: string;
  createdByName?: string; createdAt: string;
}

interface ProductRow {
  id: string; projectId: string; sortOrder: number;
  productCategory?: string; productName?: string; modelName?: string;
  manufacturer?: string; productionLot?: string;
  dimensions?: string; weightG?: number; certNumber?: string; remark?: string;
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

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">프로젝트 정보</h2>
            {savingProject && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {isClosed && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">마감된 프로젝트입니다. 수정하려면 먼저 마감을 해제하세요.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="프로젝트명" value={project.projectName} onBlurSave={v => patchProject({ projectName: v })} disabled={isClosed} />
            <Field label="내부 관리번호" value={project.internalRefNo} onBlurSave={v => patchProject({ internalRefNo: v })} disabled={isClosed} />
            <Field label="고객사" value={project.customerName} onBlurSave={v => patchProject({ customerName: v })} disabled={isClosed} />
            <Field label="공급업체" value={project.supplierName} onBlurSave={v => patchProject({ supplierName: v })} disabled={isClosed} />
            <Field label="제조업체" value={project.manufacturerName} onBlurSave={v => patchProject({ manufacturerName: v })} disabled={isClosed} />
            <Field label="기본 모델명" value={project.baseModelName} onBlurSave={v => patchProject({ baseModelName: v })} disabled={isClosed} />
            <Field label="PO 번호" value={project.poNumber} onBlurSave={v => patchProject({ poNumber: v })} disabled={isClosed} />
            <Field label="PI 번호" value={project.piNumber} onBlurSave={v => patchProject({ piNumber: v })} disabled={isClosed} />
            <Field label="생산 LOT 번호" value={project.productionLotNo} onBlurSave={v => patchProject({ productionLotNo: v })} disabled={isClosed} />
            <Field label="제출기한" type="date" value={project.dueDate} onBlurSave={v => patchProject({ dueDate: v })} disabled={isClosed} />
          </div>
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
                    <Field label="제품명" value={p.productName} onBlurSave={v => patchProduct(p.id, { productName: v })} disabled={isClosed} />
                    <Field label="모델명" value={p.modelName} onBlurSave={v => patchProduct(p.id, { modelName: v })} disabled={isClosed} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="제조업체" value={p.manufacturer} onBlurSave={v => patchProduct(p.id, { manufacturer: v })} disabled={isClosed} />
                    <Field label="생산 LOT" value={p.productionLot} onBlurSave={v => patchProduct(p.id, { productionLot: v })} disabled={isClosed} />
                    <Field label="인증번호" value={p.certNumber} onBlurSave={v => patchProduct(p.id, { certNumber: v })} disabled={isClosed} />
                  </div>
                  <Link href={`/approval-inspection/${id}/products/${p.id}`} className="text-xs text-primary hover:underline inline-block pt-1">
                    측정값/배선/사진 입력 →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <ImportExportPanel id={id} disabled={isClosed} onImported={load} />
        <GenerateDocPanel id={id} hasProducts={products.length > 0} />
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
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onBlurSave, disabled, type = 'text' }: {
  label: string; value?: string | number; onBlurSave: (v: string) => void; disabled?: boolean; type?: string;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input
        type={type}
        value={local}
        disabled={disabled}
        onChange={e => setLocal(e.target.value)}
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
