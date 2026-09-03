'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, FileCheck2, Plus, Trash2, Send, Upload, RotateCw, AlertTriangle, ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react';
import { PHOTO_CATEGORIES, STANDARD_MEASUREMENT_ITEMS } from '@/lib/approval-inspection/types';

type Lang = 'ko' | 'zh' | 'en';

const UI: Record<Lang, Record<string, string>> = {
  zh: {
    step1: '1. 项目信息', step2: '2. 产品资料', step3: '3. 检查并提交',
    prev: '上一步', next: '下一步', addProduct: '添加产品', noProducts: '尚未添加产品。',
    measurements: '测量项目', wires: '输入线/输出线', photos: '照片',
    baseline: '基准值', measured: '测量值', unit: '单位', range: '允许范围', judgement: '判定', item: '项目',
    input: '输入线', output: '输出线', add: '添加', delete: '删除', save: '保存',
    submitterPrompt: '请输入您的姓名以完成提交', submit: '提交', submitting: '提交中...',
    submitted: '提交完成', closed: '本项目已关闭，无法编辑。',
    reviewEmpty: '未发现问题。', warning: '警告', blocking: '错误',
    customer: '客户', supplier: '供应商', productName: '产品名称', baseModel: '基本型号',
    poNumber: 'PO编号', piNumber: 'PI编号', dueDate: '提交期限', contact: '负责人联系方式',
    productionLot: '生产批号', productionQty: '生产数量', inspectionQty: '检验数量', defectQty: '不良数量', defectRate: '不良率',
    shippingDate: '预计装船日期', memo: '备注', modelName: '型号', spec: '规格', unnamed: '(无产品名称)',
    wireSpec: '规格', baseLength: '基准长度', measuredLength: '测量长度', connector: '连接器', response: '回复...', reply: '回复',
  },
  en: {
    step1: '1. Project Info', step2: '2. Product Data', step3: '3. Review & Submit',
    prev: 'Previous', next: 'Next', addProduct: 'Add Product', noProducts: 'No products added yet.',
    measurements: 'Measurements', wires: 'Input/Output Wires', photos: 'Photos',
    baseline: 'Baseline', measured: 'Measured', unit: 'Unit', range: 'Allowed Range', judgement: 'Judgement', item: 'Item',
    input: 'Input Wire', output: 'Output Wire', add: 'Add', delete: 'Delete', save: 'Save',
    submitterPrompt: 'Enter your name to complete submission', submit: 'Submit', submitting: 'Submitting...',
    submitted: 'Submitted', closed: 'This project is closed and cannot be edited.',
    reviewEmpty: 'No issues found.', warning: 'Warning', blocking: 'Error',
    customer: 'Customer', supplier: 'Supplier', productName: 'Product Name', baseModel: 'Base Model',
    poNumber: 'PO Number', piNumber: 'PI Number', dueDate: 'Due Date', contact: 'Contact',
    productionLot: 'Production Lot', productionQty: 'Production Qty', inspectionQty: 'Inspection Qty', defectQty: 'Defect Qty', defectRate: 'Defect Rate',
    shippingDate: 'Shipping Date', memo: 'Remark', modelName: 'Model Name', spec: 'Spec', unnamed: '(No product name)',
    wireSpec: 'Spec', baseLength: 'Baseline Length', measuredLength: 'Measured Length', connector: 'Connector', response: 'Reply...', reply: 'Reply',
  },
  ko: {
    step1: '1. 프로젝트 정보', step2: '2. 제품 자료', step3: '3. 검토 및 제출',
    prev: '이전', next: '다음', addProduct: '제품 추가', noProducts: '등록된 제품이 없습니다.',
    measurements: '측정항목', wires: '입력선/출력선', photos: '사진',
    baseline: '기준값', measured: '측정값', unit: '단위', range: '허용범위', judgement: '판정', item: '항목',
    input: '입력선', output: '출력선', add: '추가', delete: '삭제', save: '저장',
    submitterPrompt: '제출자 이름을 입력하세요', submit: '제출하기', submitting: '제출 중...',
    submitted: '제출 완료', closed: '이 프로젝트는 마감되어 수정할 수 없습니다.',
    reviewEmpty: '발견된 문제가 없습니다.', warning: '경고', blocking: '오류',
    customer: '고객사', supplier: '공급업체', productName: '제품명', baseModel: '기본 모델명',
    poNumber: 'PO 번호', piNumber: 'PI 번호', dueDate: '제출기한', contact: '담당자 연락처',
    productionLot: '생산 LOT 번호', productionQty: '생산수량', inspectionQty: '검사수량', defectQty: '불량수량', defectRate: '불량율',
    shippingDate: '선적예정일', memo: '비고', modelName: '모델명', spec: '스펙', unnamed: '(제품명 없음)',
    wireSpec: '규격', baseLength: '기준길이', measuredLength: '측정길이', connector: '커넥터', response: '응답 입력...', reply: '응답',
  },
};

const JUDGEMENT_LABELS: Record<Lang, Record<string, string>> = {
  ko: { '적합': '적합', '부적합': '부적합', '조건부 승인': '조건부 승인', '재검사 필요': '재검사 필요', '해당 없음': '해당 없음' },
  zh: { '적합': '合格', '부적합': '不合格', '조건부 승인': '有条件批准', '재검사 필요': '需要复检', '해당 없음': '不适用' },
  en: { '적합': 'Pass', '부적합': 'Fail', '조건부 승인': 'Conditional', '재검사 필요': 'Retest Needed', '해당 없음': 'N/A' },
};

interface ProjectInfo {
  id: string; businessId: string; reportType: 'pre_approval' | 'pre_shipment'; title: string;
  projectName: string; customerName?: string; supplierName?: string; productName?: string; baseModelName?: string;
  poNumber?: string; piNumber?: string; productionLotNo?: string; productionQty?: number; inspectionQty?: number; defectQty?: number;
  shippingDate?: string; dueDate?: string; supplierContact?: string; memo?: string;
  status: string; defaultLanguage: Lang;
}
interface ProductRow { id: string; productCategory?: string; productName?: string; modelName?: string; specText?: string; productionLot?: string }
interface MeasurementRow {
  id: string; itemKey: string; itemLabel: string; baselineValue?: string; baselineUnit?: string;
  measuredValue?: string; measuredUnit?: string; minValue?: string; maxValue?: string; judgement?: string;
}
interface WireSpecRow {
  id: string; wireRole: 'input' | 'output'; wireSpec?: string; conductorArea?: string;
  baselineLengthValue?: string; baselineLengthUnit?: string; measuredLengthValue?: string; measuredLengthUnit?: string;
  connectorManufacturer?: string; connectorModel?: string; remark?: string;
}
interface PhotoRow { id: string; categoryKey: string; rotationDeg: number; cropRect: { x: number; y: number; w: number; h: number } | null }
interface ValidationIssueRow { key: string; severity: 'blocking' | 'warning'; productId: string; message: string; acknowledged: boolean }

const JUDGEMENT_OPTIONS = ['적합', '부적합', '조건부 승인', '재검사 필요', '해당 없음'];
const LENGTH_UNITS = ['mm', 'cm', 'm'];

export default function InspectionFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState(1);
  const [lang, setLang] = useState<Lang>('zh');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/inspection-form/${token}`);
      if (!r.ok) { setNotFound(true); return; }
      const j = await r.json();
      setProject(j.data);
      setLang(j.data.defaultLanguage || 'zh');
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const t = (k: string) => UI[lang][k] || k;
  const isClosed = project?.status === 'closed';

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (notFound || !project) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">유효하지 않은 링크입니다.</div>;

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-semibold">{project.title}</h1>
              <p className="text-xs text-muted-foreground font-mono">{project.businessId} · {project.projectName}</p>
            </div>
            <div className="flex gap-1">
              {(['ko', 'zh', 'en'] as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)} className={`text-xs px-2 py-1 rounded ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {isClosed && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mt-2">{t('closed')}</p>}
        </div>

        <RevisionRequestsBanner token={token} disabled={isClosed} t={t} />

        <div className="flex items-center gap-1 text-xs">
          {[1, 2, 3].map(s => (
            <button key={s} onClick={() => setStep(s)} className={`flex-1 text-center py-2 rounded-md border ${step === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground'}`}>
              {t(`step${s}`)}
            </button>
          ))}
        </div>

        {step === 1 && <ProjectInfoStep token={token} project={project} lang={lang} disabled={isClosed} onUpdated={setProject} t={t} />}
        {step === 2 && <ProductsStep token={token} lang={lang} disabled={isClosed} t={t} />}
        {step === 3 && <ReviewStep token={token} lang={lang} t={t} disabled={isClosed} onSubmitted={load} status={project.status} />}

        <div className="flex items-center justify-between">
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="text-sm text-muted-foreground disabled:opacity-30 flex items-center gap-1"><ChevronLeft className="w-4 h-4" />{t('prev')}</button>
          <button onClick={() => setStep(s => Math.min(3, s + 1))} disabled={step === 3} className="text-sm text-primary disabled:opacity-30 flex items-center gap-1">{t('next')}<ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

function ProjectInfoStep({ token, project, disabled, onUpdated, t }: {
  token: string; project: ProjectInfo; lang: Lang; disabled: boolean; onUpdated: (p: ProjectInfo) => void; t: (k: string) => string;
}) {
  const patch = async (body: Partial<ProjectInfo>) => {
    const r = await fetch(`/api/inspection-form/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.ok) onUpdated(j.data);
  };
  const defectRate = project.inspectionQty ? ((project.defectQty ?? 0) / project.inspectionQty * 100).toFixed(2) + '%' : '-';
  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <ReadOnlyField label={t('customer')} value={project.customerName} />
        <ReadOnlyField label={t('productName')} value={project.productName} />
        <ReadOnlyField label={t('baseModel')} value={project.baseModelName} />
        <ReadOnlyField label={t('dueDate')} value={project.dueDate} />
      </div>
      <hr />
      <div className="grid grid-cols-2 gap-3">
        <ExternalField label={t('supplier')} value={project.supplierName} disabled={disabled} onSave={v => patch({ supplierName: v })} />
        <ExternalField label={t('poNumber')} value={project.poNumber} disabled={disabled} onSave={v => patch({ poNumber: v })} />
        <ExternalField label={t('piNumber')} value={project.piNumber} disabled={disabled} onSave={v => patch({ piNumber: v })} />
        <ExternalField label={t('contact')} value={project.supplierContact} disabled={disabled} onSave={v => patch({ supplierContact: v })} />
        <ExternalField label={t('productionLot')} value={project.productionLotNo} disabled={disabled} onSave={v => patch({ productionLotNo: v })} />
        <ExternalField label={t('productionQty')} value={project.productionQty != null ? String(project.productionQty) : undefined} disabled={disabled} onSave={v => patch({ productionQty: Number(v) as unknown as number })} />
        <ExternalField label={t('inspectionQty')} value={project.inspectionQty != null ? String(project.inspectionQty) : undefined} disabled={disabled} onSave={v => patch({ inspectionQty: Number(v) as unknown as number })} />
        <ExternalField label={t('defectQty')} value={project.defectQty != null ? String(project.defectQty) : undefined} disabled={disabled} onSave={v => patch({ defectQty: Number(v) as unknown as number })} />
        <div><span className="text-xs text-muted-foreground mb-1 block">{t('defectRate')}</span><span className="text-sm">{defectRate}</span></div>
        <ExternalField label={t('shippingDate')} type="date" value={project.shippingDate} disabled={disabled} onSave={v => patch({ shippingDate: v })} />
      </div>
      <ExternalField label={t('memo')} textarea value={project.memo} disabled={disabled} onSave={v => patch({ memo: v })} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return <div><span className="text-xs text-muted-foreground block">{label}</span><span>{value || '-'}</span></div>;
}

function ExternalField({ label, value, onSave, disabled, type = 'text', textarea }: {
  label: string; value?: string; onSave: (v: string) => void; disabled?: boolean; type?: string; textarea?: boolean;
}) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <div className={textarea ? 'col-span-2' : ''}>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {textarea ? (
        <textarea className="w-full min-h-[70px] text-sm rounded-md border border-input bg-background px-3 py-2" disabled={disabled} value={local} onChange={e => setLocal(e.target.value)} onBlur={() => { if (local !== (value ?? '')) onSave(local); }} />
      ) : (
        <input type={type} disabled={disabled} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={local} onChange={e => setLocal(e.target.value)} onBlur={() => { if (local !== (value ?? '')) onSave(local); }} />
      )}
    </div>
  );
}

function ProductsStep({ token, lang, disabled, t }: { token: string; lang: Lang; disabled: boolean; t: (k: string) => string }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/inspection-form/${token}/products`).then(x => x.json());
      setProducts(r.data ?? []);
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const addProduct = async () => {
    const r = await fetch(`/api/inspection-form/${token}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const j = await r.json();
    if (r.ok) { setProducts(prev => [...prev, j.data]); setExpanded(j.data.id); }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    const r = await fetch(`/api/inspection-form/${token}/products/${id}`, { method: 'DELETE' });
    if (r.ok) setProducts(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {!disabled && (
        <button onClick={addProduct} className="w-full border-2 border-dashed rounded-lg py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" />{t('addProduct')}
        </button>
      )}
      {products.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('noProducts')}</p>}
      {products.map(p => (
        <div key={p.id} className="bg-card border rounded-xl overflow-hidden">
          <button onClick={() => setExpanded(e => (e === p.id ? null : p.id))} className="w-full flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{p.productName || t('unnamed')} {p.modelName ? `— ${p.modelName}` : ''}</span>
            <div className="flex items-center gap-2">
              {!disabled && <span onClick={e => { e.stopPropagation(); deleteProduct(p.id); }} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></span>}
              {expanded === p.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </button>
          {expanded === p.id && <ProductEditor token={token} product={p} disabled={disabled} t={t} lang={lang} onUpdated={u => setProducts(prev => prev.map(x => (x.id === u.id ? u : x)))} />}
        </div>
      ))}
    </div>
  );
}

function ProductEditor({ token, product, disabled, t, lang, onUpdated }: {
  token: string; product: ProductRow; disabled: boolean; t: (k: string) => string; lang: Lang; onUpdated: (p: ProductRow) => void;
}) {
  const [form, setForm] = useState(product);
  const patchProduct = async (patch: Partial<ProductRow>) => {
    const merged = { ...form, ...patch };
    setForm(merged);
    const r = await fetch(`/api/inspection-form/${token}/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (r.ok) onUpdated(j.data);
  };

  return (
    <div className="border-t p-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <ExternalField label={t('productName')} value={form.productName} disabled={disabled} onSave={v => patchProduct({ productName: v })} />
        <ExternalField label={t('modelName')} value={form.modelName} disabled={disabled} onSave={v => patchProduct({ modelName: v })} />
        <ExternalField label={t('spec')} textarea value={form.specText} disabled={disabled} onSave={v => patchProduct({ specText: v })} />
      </div>

      <MeasurementsPanel token={token} productId={product.id} disabled={disabled} t={t} lang={lang} />
      <WiresPanel token={token} productId={product.id} disabled={disabled} t={t} />
      <PhotosPanel token={token} productId={product.id} disabled={disabled} t={t} lang={lang} />
    </div>
  );
}

function MeasurementsPanel({ token, productId, disabled, t, lang }: { token: string; productId: string; disabled: boolean; t: (k: string) => string; lang: Lang }) {
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/inspection-form/${token}/products/${productId}/measurements`).then(r => r.json()).then(j => setRows(j.data ?? []));
  }, [token, productId]);

  const update = (id: string, patch: Partial<MeasurementRow>) => { setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r))); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/inspection-form/${token}/products/${productId}/measurements`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows.map(r => ({ id: r.id, baselineValue: r.baselineValue ?? null, baselineUnit: r.baselineUnit ?? null, measuredValue: r.measuredValue ?? null, measuredUnit: r.measuredUnit ?? null, minValue: r.minValue ?? null, maxValue: r.maxValue ?? null, judgement: r.judgement ?? null })) }),
      });
      if (r.ok) setDirty(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">{t('measurements')}</h3>
        {!disabled && <button onClick={save} disabled={saving || !dirty} className="text-xs text-primary hover:underline disabled:opacity-30">{saving ? '...' : t('save')}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead><tr className="text-muted-foreground">
            <th className="text-left py-1">{t('item')}</th><th className="text-left">{t('baseline')}</th><th className="text-left">{t('measured')}</th><th className="text-left">{t('judgement')}</th>
          </tr></thead>
          <tbody className="divide-y">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-1 pr-1">{STANDARD_MEASUREMENT_ITEMS.find(i => i.key === r.itemKey)?.labelI18n[lang] ?? r.itemLabel}</td>
                <td className="pr-1"><input disabled={disabled} className="w-20 h-7 border rounded px-1" value={r.baselineValue ?? ''} onChange={e => update(r.id, { baselineValue: e.target.value })} /></td>
                <td className="pr-1"><input disabled={disabled} className="w-20 h-7 border rounded px-1" value={r.measuredValue ?? ''} onChange={e => update(r.id, { measuredValue: e.target.value })} /></td>
                <td>
                  <select disabled={disabled} className="h-7 border rounded px-1" value={r.judgement ?? ''} onChange={e => update(r.id, { judgement: e.target.value })}>
                    <option value="">-</option>
                    {JUDGEMENT_OPTIONS.map(o => <option key={o} value={o}>{JUDGEMENT_LABELS[lang][o] ?? o}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WiresPanel({ token, productId, disabled, t }: { token: string; productId: string; disabled: boolean; t: (k: string) => string }) {
  const [wires, setWires] = useState<WireSpecRow[]>([]);

  const load = useCallback(() => {
    fetch(`/api/inspection-form/${token}/products/${productId}/wire-specs`).then(r => r.json()).then(j => setWires(j.data ?? []));
  }, [token, productId]);
  useEffect(() => { load(); }, [load]);

  const addWire = async (role: 'input' | 'output') => {
    const r = await fetch(`/api/inspection-form/${token}/products/${productId}/wire-specs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wireRole: role }) });
    const j = await r.json();
    if (r.ok) setWires(prev => [...prev, j.data]);
  };

  const deleteWire = async (id: string) => {
    const r = await fetch(`/api/inspection-form/${token}/products/${productId}/wire-specs/${id}`, { method: 'DELETE' });
    if (r.ok) setWires(prev => prev.filter(w => w.id !== id));
  };

  const save = async (row: WireSpecRow) => {
    await fetch(`/api/inspection-form/${token}/products/${productId}/wire-specs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ id: row.id, wireSpec: row.wireSpec ?? null, conductorArea: row.conductorArea ?? null, baselineLengthValue: row.baselineLengthValue ?? null, baselineLengthUnit: row.baselineLengthUnit ?? null, measuredLengthValue: row.measuredLengthValue ?? null, measuredLengthUnit: row.measuredLengthUnit ?? null, connectorManufacturer: row.connectorManufacturer ?? null, connectorModel: row.connectorModel ?? null, remark: row.remark ?? null }] }),
    });
  };

  const update = (id: string, patch: Partial<WireSpecRow>) => setWires(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)));

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold">{t('wires')}</h3>
      {(['input', 'output'] as const).map(role => (
        <div key={role} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{t(role)}</span>
            {!disabled && <button onClick={() => addWire(role)} className="text-[11px] text-primary hover:underline">+{t('add')}</button>}
          </div>
          {wires.filter(w => w.wireRole === role).map(w => (
            <div key={w.id} className="flex flex-wrap items-center gap-1.5 border rounded p-1.5">
              <input disabled={disabled} placeholder={t('wireSpec')} className="w-20 h-7 text-xs border rounded px-1" value={w.wireSpec ?? ''} onChange={e => update(w.id, { wireSpec: e.target.value })} onBlur={() => save(w)} />
              <input disabled={disabled} placeholder={t('baseLength')} className="w-16 h-7 text-xs border rounded px-1" value={w.baselineLengthValue ?? ''} onChange={e => update(w.id, { baselineLengthValue: e.target.value })} onBlur={() => save(w)} />
              <select disabled={disabled} className="h-7 text-xs border rounded px-1" value={w.baselineLengthUnit ?? 'mm'} onChange={e => { update(w.id, { baselineLengthUnit: e.target.value }); save({ ...w, baselineLengthUnit: e.target.value }); }}>
                {LENGTH_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input disabled={disabled} placeholder={t('measuredLength')} className="w-16 h-7 text-xs border rounded px-1" value={w.measuredLengthValue ?? ''} onChange={e => update(w.id, { measuredLengthValue: e.target.value })} onBlur={() => save(w)} />
              <select disabled={disabled} className="h-7 text-xs border rounded px-1" value={w.measuredLengthUnit ?? 'mm'} onChange={e => { update(w.id, { measuredLengthUnit: e.target.value }); save({ ...w, measuredLengthUnit: e.target.value }); }}>
                {LENGTH_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input disabled={disabled} placeholder={t('connector')} className="w-20 h-7 text-xs border rounded px-1" value={w.connectorModel ?? ''} onChange={e => update(w.id, { connectorModel: e.target.value })} onBlur={() => save(w)} />
              {!disabled && <button onClick={() => deleteWire(w.id)} className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PhotosPanel({ token, productId, disabled, t, lang }: { token: string; productId: string; disabled: boolean; t: (k: string) => string; lang: Lang }) {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);

  const load = useCallback(() => {
    fetch(`/api/inspection-form/${token}/products/${productId}/photos`).then(r => r.json()).then(j => setPhotos(j.data ?? []));
  }, [token, productId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (categoryKey: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('categoryKey', categoryKey);
    const r = await fetch(`/api/inspection-form/${token}/products/${productId}/photos`, { method: 'POST', body: formData });
    if (r.ok) load();
  };

  const remove = async (id: string) => {
    const r = await fetch(`/api/inspection-form/${token}/products/${productId}/photos/${id}`, { method: 'DELETE' });
    if (r.ok) load();
  };

  const rotate = async (photo: PhotoRow) => {
    const next = ((photo.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    const r = await fetch(`/api/inspection-form/${token}/products/${productId}/photos/${photo.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotationDeg: next }) });
    if (r.ok) load();
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold">{t('photos')}</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {PHOTO_CATEGORIES.map(cat => {
          const photo = photos.find(p => p.categoryKey === cat.key);
          return (
            <div key={cat.key} className="border rounded p-1.5 space-y-1">
              <p className="text-[10px] truncate" title={cat.label[lang]}>{cat.label[lang]}</p>
              {photo ? (
                <div className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/inspection-form/${token}/products/${productId}/photos/${photo.id}/file?variant=edited`} alt="" className="w-full h-16 object-contain bg-muted/30 rounded" />
                  {!disabled && (
                    <div className="flex items-center justify-between">
                      <button onClick={() => rotate(photo)}><RotateCw className="w-3 h-3 text-muted-foreground" /></button>
                      <button onClick={() => remove(photo.id)}><Trash2 className="w-3 h-3 text-red-500" /></button>
                    </div>
                  )}
                </div>
              ) : !disabled ? (
                <label className="flex items-center justify-center h-16 border border-dashed rounded cursor-pointer text-muted-foreground">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(cat.key, f); e.target.value = ''; }} />
                </label>
              ) : <div className="h-16 rounded bg-muted/20" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStep({ token, t, disabled, onSubmitted, status }: {
  token: string; lang: Lang; t: (k: string) => string; disabled: boolean; onSubmitted: () => void; status: string;
}) {
  const [issues, setIssues] = useState<ValidationIssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitterName, setSubmitterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/inspection-form/${token}/validation`).then(r => r.json()).then(j => { setIssues(j.data ?? []); setLoading(false); });
  }, [token]);

  const blockingUnacked = useMemo(() => issues.filter(i => i.severity === 'blocking' && !i.acknowledged), [issues]);
  const alreadySubmitted = ['submitted', 'resubmitted', 'internal_review', 'approved', 'conditional_approval', 'shipment_hold'].includes(status);

  const submit = async () => {
    if (!submitterName.trim()) { setError(UI.ko.submitterPrompt); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch(`/api/inspection-form/${token}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submitterName }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || '제출 실패'); return; }
      onSubmitted();
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('reviewEmpty')}</p>
      ) : (
        <div className="space-y-1.5">
          {issues.map(issue => (
            <div key={issue.key} className={`flex items-start gap-1.5 rounded-md px-3 py-2 text-xs ${issue.severity === 'blocking' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'} ${issue.acknowledged ? 'opacity-50' : ''}`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>[{issue.severity === 'blocking' ? t('blocking') : t('warning')}] {issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {alreadySubmitted ? (
        <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 flex items-center gap-1.5"><FileCheck2 className="w-4 h-4" />{t('submitted')}</p>
      ) : !disabled && (
        <div className="space-y-2 pt-2 border-t">
          <input placeholder={t('submitterPrompt')} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={submitterName} onChange={e => setSubmitterName(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {blockingUnacked.length > 0 && <p className="text-xs text-red-600">확인되지 않은 오류가 있어 제출이 제한될 수 있습니다.</p>}
          <button onClick={submit} disabled={submitting} className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? t('submitting') : t('submit')}
          </button>
        </div>
      )}
    </div>
  );
}

interface RevisionRequestRow {
  id: string; requestContent: string; requestedByName?: string; requestedAt: string; supplierResponse?: string; status: string;
}

/** §16 — 내부 담당자의 수정요청을 외부 화면에 경고색으로 노출한다. 공급업체는
 * 응답만 남길 수 있고 요청 자체나 상태는 바꿀 수 없다. */
function RevisionRequestsBanner({ token, disabled, t }: { token: string; disabled: boolean; t: (k: string) => string }) {
  const [requests, setRequests] = useState<RevisionRequestRow[]>([]);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/inspection-form/${token}/revision-requests`).then(r => r.json()).then(j => setRequests(j.data ?? []));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const respond = async (requestId: string) => {
    const text = responseDraft[requestId]?.trim();
    if (!text) return;
    setSubmitting(requestId);
    try {
      const r = await fetch(`/api/inspection-form/${token}/revision-requests/${requestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplierResponse: text }),
      });
      if (r.ok) { setResponseDraft(d => ({ ...d, [requestId]: '' })); load(); }
    } finally { setSubmitting(null); }
  };

  const open = requests.filter(r => r.status === 'open');
  if (open.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {open.map(r => (
        <div key={r.id} className="bg-amber-50 border border-amber-300 rounded-md px-3 py-2 text-xs text-amber-900 space-y-1.5">
          <p className="font-medium">⚠ {r.requestContent}</p>
          {!disabled && (
            <div className="flex gap-2">
              <input
                className="flex-1 h-8 rounded border border-amber-300 bg-white px-2 text-xs"
                placeholder={t('response')}
                value={responseDraft[r.id] ?? ''}
                onChange={e => setResponseDraft(d => ({ ...d, [r.id]: e.target.value }))}
              />
              <button onClick={() => respond(r.id)} disabled={submitting === r.id} className="text-amber-900 underline shrink-0">{t('reply')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
