'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BadgeCheck, Plus, Loader2, Trash2, ArrowLeft, AlertTriangle, Check, Upload, RotateCw, Camera, Cable, FlaskConical, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PHOTO_CATEGORIES } from '@/lib/approval-inspection/types';

interface MeasurementRow {
  id: string; itemKey: string; itemLabel: string;
  baselineValue?: string; baselineUnit?: string;
  measuredValue?: string; measuredUnit?: string;
  minValue?: string; maxValue?: string; tolerance?: string;
  equipment?: string; judgement?: string; remark?: string; sortOrder: number;
}

interface ValidationIssueRow {
  key: string; severity: 'blocking' | 'warning'; productId: string; itemKey?: string; message: string; acknowledged: boolean;
}

interface PhotoRow {
  id: string; categoryKey: string; originalFilename: string; sizeBytes: number;
  cropRect: { x: number; y: number; w: number; h: number } | null;
  rotationDeg: number; hasEditedFile: boolean; createdAt: string;
}

interface WireSpecRow {
  id: string; wireRole: 'input' | 'output';
  wireSpec?: string; conductorArea?: string; coreCount?: string; insulationMaterial?: string; color?: string;
  baselineLengthValue?: string; baselineLengthUnit?: string;
  measuredLengthValue?: string; measuredLengthUnit?: string;
  stripLength?: string; endTreatment?: string;
  connectorManufacturer?: string; connectorModel?: string; pinCount?: string; polarity?: string; remark?: string;
  sortOrder: number;
}

interface SampleRow {
  id: string; sampleNo: string; samplingMethod?: string; inspectionDate?: string; inspectionPlace?: string; inspector?: string;
  measurements: { id: string; itemKey: string; itemLabel: string; measuredValue?: string; unit?: string; judgement?: string }[];
}
interface DiffRow {
  id: string; compareItem: string; judgement?: string; changeLocation?: string; beforeDesc?: string; afterDesc?: string;
  reason?: string; needsApproval: boolean; supplierExplanation?: string; internalReviewOpinion?: string;
}

const JUDGEMENT_OPTIONS = ['적합', '부적합', '조건부 승인', '재검사 필요', '해당 없음'];
const DIFF_JUDGEMENT_OPTIONS = ['동일', '허용 가능한 차이', '승인되지 않은 변경', '확인 필요', '해당 없음'];
const GROUP_LABEL: Record<string, string> = { product: '제품 전체', pcb: 'PCB', wiring: '배선/커넥터' };
const WIRE_ROLE_LABEL: Record<string, string> = { input: '입력선', output: '출력선' };
const LENGTH_UNITS = ['mm', 'cm', 'm'];

export default function ProductMeasurementsPage() {
  const params = useParams();
  const id = params.id as string;
  const productId = params.productId as string;

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<ValidationIssueRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [wires, setWires] = useState<WireSpecRow[]>([]);
  const [wiresDirty, setWiresDirty] = useState(false);
  const [wiresSaving, setWiresSaving] = useState(false);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [sampleStats, setSampleStats] = useState<Record<string, { itemLabel: string; unit: string | null; avg: number | null; min: number | null; max: number | null; count: number }>>({});
  const [diffs, setDiffs] = useState<DiffRow[]>([]);
  const [diffsDirty, setDiffsDirty] = useState(false);
  const [diffsSaving, setDiffsSaving] = useState(false);

  const loadPhotos = useCallback(async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/photos`).then(x => x.json());
    setPhotos(r.data ?? []);
  }, [id, productId]);

  const loadWires = useCallback(async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/wire-specs`).then(x => x.json());
    setWires(r.data ?? []);
  }, [id, productId]);

  const loadSamples = useCallback(async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/samples`).then(x => x.json());
    setSamples(r.data ?? []);
    setSampleStats(r.stats ?? {});
  }, [id, productId]);

  const loadDiffs = useCallback(async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/diffs`).then(x => x.json());
    setDiffs(r.data ?? []);
  }, [id, productId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, pRes, vRes] = await Promise.all([
        fetch(`/api/approval-inspection/${id}/products/${productId}/measurements`).then(r => r.json()),
        fetch(`/api/approval-inspection/${id}/products`).then(r => r.json()),
        fetch(`/api/approval-inspection/${id}/validation`).then(r => r.json()),
      ]);
      setRows(mRes.data ?? []);
      const product = (pRes.data ?? []).find((p: { id: string }) => p.id === productId);
      setProductName(product ? [product.productName, product.modelName].filter(Boolean).join(' / ') : '');
      setIssues((vRes.data ?? []).filter((i: ValidationIssueRow) => i.productId === productId));
      await Promise.all([loadPhotos(), loadWires(), loadSamples(), loadDiffs()]);
    } finally { setLoading(false); }
  }, [id, productId, loadPhotos, loadWires, loadSamples, loadDiffs]);

  useEffect(() => { load(); }, [load]);

  const updateRow = (rowId: string, patch: Partial<MeasurementRow>) => {
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/measurements`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows.map(r => ({
          id: r.id, itemLabel: r.itemLabel, baselineValue: r.baselineValue ?? null, baselineUnit: r.baselineUnit ?? null,
          measuredValue: r.measuredValue ?? null, measuredUnit: r.measuredUnit ?? null,
          minValue: r.minValue ?? null, maxValue: r.maxValue ?? null, tolerance: r.tolerance ?? null,
          equipment: r.equipment ?? null, judgement: r.judgement ?? null, remark: r.remark ?? null,
        })) }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '저장 실패'); return; }
      setDirty(false);
      const vRes = await fetch(`/api/approval-inspection/${id}/validation`).then(x => x.json());
      setIssues((vRes.data ?? []).filter((i: ValidationIssueRow) => i.productId === productId));
    } finally { setSaving(false); }
  };

  const addRow = async () => {
    const label = prompt('새 측정항목명을 입력하세요.');
    if (!label?.trim()) return;
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/measurements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemLabel: label.trim() }),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '추가 실패'); return; }
    setRows(prev => [...prev, j.data]);
  };

  const deleteRow = async (rowId: string) => {
    if (!confirm('이 측정항목을 삭제할까요?')) return;
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/measurements/${rowId}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '삭제 실패'); return; }
    setRows(prev => prev.filter(r2 => r2.id !== rowId));
  };

  const acknowledge = async (issueKey: string) => {
    const note = prompt('확인 사유(선택)를 입력하세요.') || '';
    const r = await fetch(`/api/approval-inspection/${id}/validation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issueKey, note }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '확인 처리 실패'); return; }
    setIssues(prev => prev.map(i => (i.key === issueKey ? { ...i, acknowledged: true } : i)));
  };

  const blockingUnacked = useMemo(() => issues.filter(i => i.severity === 'blocking' && !i.acknowledged), [issues]);

  const updateWire = (wireId: string, patch: Partial<WireSpecRow>) => {
    setWires(prev => prev.map(w => (w.id === wireId ? { ...w, ...patch } : w)));
    setWiresDirty(true);
  };

  const addWire = async (wireRole: 'input' | 'output') => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/wire-specs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wireRole }),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '추가 실패'); return; }
    setWires(prev => [...prev, j.data]);
  };

  const deleteWire = async (wireId: string) => {
    if (!confirm('이 배선 정보를 삭제할까요?')) return;
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/wire-specs/${wireId}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '삭제 실패'); return; }
    setWires(prev => prev.filter(w => w.id !== wireId));
  };

  const saveWires = async () => {
    setWiresSaving(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/wire-specs`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: wires.map(w => ({
          id: w.id, wireSpec: w.wireSpec ?? null, conductorArea: w.conductorArea ?? null, coreCount: w.coreCount ?? null,
          insulationMaterial: w.insulationMaterial ?? null, color: w.color ?? null,
          baselineLengthValue: w.baselineLengthValue ?? null, baselineLengthUnit: w.baselineLengthUnit ?? null,
          measuredLengthValue: w.measuredLengthValue ?? null, measuredLengthUnit: w.measuredLengthUnit ?? null,
          stripLength: w.stripLength ?? null, endTreatment: w.endTreatment ?? null,
          connectorManufacturer: w.connectorManufacturer ?? null, connectorModel: w.connectorModel ?? null,
          pinCount: w.pinCount ?? null, polarity: w.polarity ?? null, remark: w.remark ?? null,
        })) }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '저장 실패'); return; }
      setWiresDirty(false);
    } finally { setWiresSaving(false); }
  };

  const uploadPhoto = async (categoryKey: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('categoryKey', categoryKey);
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/photos`, { method: 'POST', body: formData });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '업로드 실패'); return; }
    loadPhotos();
  };

  const deletePhoto = async (photoId: string) => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/photos/${photoId}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '삭제 실패'); return; }
    loadPhotos();
  };

  const editPhoto = async (photoId: string, patch: { rotationDeg?: number; crop?: { x: number; y: number; w: number; h: number } | null }) => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/photos/${photoId}/edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '편집 실패'); return; }
    loadPhotos();
  };

  const addSample = async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/samples`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '추가 실패'); return; }
    loadSamples();
  };

  const deleteSample = async (sampleId: string) => {
    if (!confirm('이 샘플을 삭제할까요?')) return;
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/samples/${sampleId}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '삭제 실패'); return; }
    loadSamples();
  };

  const saveSampleMeasurements = async (sampleId: string, rowsToSave: SampleRow['measurements']) => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/samples/${sampleId}/measurements`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rowsToSave.map(m => ({ id: m.id, measuredValue: m.measuredValue ?? null, unit: m.unit ?? null, judgement: m.judgement ?? null })) }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || '저장 실패'); return; }
    loadSamples();
  };

  const updateDiff = (diffId: string, patch: Partial<DiffRow>) => {
    setDiffs(prev => prev.map(d => (d.id === diffId ? { ...d, ...patch } : d)));
    setDiffsDirty(true);
  };

  const saveDiffs = async () => {
    setDiffsSaving(true);
    try {
      const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/diffs`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: diffs.map(d => ({
          id: d.id, compareItem: d.compareItem, judgement: d.judgement ?? null, changeLocation: d.changeLocation ?? null,
          beforeDesc: d.beforeDesc ?? null, afterDesc: d.afterDesc ?? null, reason: d.reason ?? null,
          needsApproval: d.needsApproval, supplierExplanation: d.supplierExplanation ?? null, internalReviewOpinion: d.internalReviewOpinion ?? null,
        })) }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '저장 실패'); return; }
      setDiffsDirty(false);
    } finally { setDiffsSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="측정값 입력" icon={<BadgeCheck className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`측정값 입력 — ${productName || '제품'}`} icon={<BadgeCheck className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <Link href={`/approval-inspection/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />프로젝트로
        </Link>

        {issues.length > 0 && (
          <div className="space-y-1.5">
            {issues.map(issue => (
              <div key={issue.key} className={cn(
                'flex items-start justify-between gap-3 rounded-md px-3 py-2 text-xs',
                issue.severity === 'blocking' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
                issue.acknowledged && 'opacity-50',
              )}>
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{issue.message}</span>
                </div>
                {!issue.acknowledged ? (
                  <button onClick={() => acknowledge(issue.key)} className="shrink-0 underline whitespace-nowrap">확인 처리</button>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap"><Check className="w-3 h-3" />확인됨</span>
                )}
              </div>
            ))}
            {blockingUnacked.length > 0 && (
              <p className="text-xs text-red-600">미확인된 차단 이슈가 {blockingUnacked.length}건 있습니다. 제출 전 확인 처리가 필요합니다.</p>
            )}
          </div>
        )}

        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">측정항목 (§7)</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5"><Plus className="w-4 h-4" />항목 추가</Button>
              <Button size="sm" onClick={saveAll} disabled={saving || !dirty} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}저장
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground w-40">항목</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">기준값</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground w-16">단위</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">측정값</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground w-16">단위</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">허용범위(min~max)</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground w-32">판정</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={r.itemLabel} onChange={e => updateRow(r.id, { itemLabel: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={r.baselineValue ?? ''} onChange={e => updateRow(r.id, { baselineValue: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={r.baselineUnit ?? ''} onChange={e => updateRow(r.id, { baselineUnit: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={r.measuredValue ?? ''} onChange={e => updateRow(r.id, { measuredValue: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><Input className="h-8 text-xs" value={r.measuredUnit ?? ''} onChange={e => updateRow(r.id, { measuredUnit: e.target.value })} /></td>
                    <td className="px-2 py-1.5 flex items-center gap-1">
                      <Input className="h-8 text-xs" placeholder="min" value={r.minValue ?? ''} onChange={e => updateRow(r.id, { minValue: e.target.value })} />
                      <span className="text-muted-foreground">~</span>
                      <Input className="h-8 text-xs" placeholder="max" value={r.maxValue ?? ''} onChange={e => updateRow(r.id, { maxValue: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs" value={r.judgement ?? ''} onChange={e => updateRow(r.id, { judgement: e.target.value })}>
                        <option value="">-</option>
                        {JUDGEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => deleteRow(r.id)} className="p-1 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Cable className="w-4 h-4" />입력선/출력선 (§10)</h2>
            <Button size="sm" onClick={saveWires} disabled={wiresSaving || !wiresDirty} className="gap-1.5">
              {wiresSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}저장
            </Button>
          </div>
          {(['input', 'output'] as const).map(role => (
            <WireSpecGroup
              key={role} role={role}
              rows={wires.filter(w => w.wireRole === role)}
              onAdd={() => addWire(role)}
              onUpdate={updateWire}
              onDelete={deleteWire}
            />
          ))}
        </div>

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-1.5"><Camera className="w-4 h-4" />사진 (§9)</h2>
          {(['product', 'pcb', 'wiring'] as const).map(group => (
            <div key={group} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{GROUP_LABEL[group]}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {PHOTO_CATEGORIES.filter(c => c.group === group).map(cat => (
                  <PhotoCell
                    key={cat.key}
                    id={id} productId={productId} categoryKey={cat.key} label={cat.label.ko}
                    photo={photos.find(p => p.categoryKey === cat.key) || null}
                    onUpload={file => uploadPhoto(cat.key, file)}
                    onDelete={photoId => deletePhoto(photoId)}
                    onEdit={(photoId, patch) => editPhoto(photoId, patch)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <SamplesPanel
          samples={samples} stats={sampleStats}
          onAdd={addSample} onDelete={deleteSample} onSaveMeasurements={saveSampleMeasurements}
        />

        {diffs.length > 0 && (
          <DiffsPanel diffs={diffs} dirty={diffsDirty} saving={diffsSaving} onUpdate={updateDiff} onSave={saveDiffs} />
        )}
      </div>
    </div>
  );
}

function SamplesPanel({ samples, stats, onAdd, onDelete, onSaveMeasurements }: {
  samples: SampleRow[];
  stats: Record<string, { itemLabel: string; unit: string | null; avg: number | null; min: number | null; max: number | null; count: number }>;
  onAdd: () => void;
  onDelete: (sampleId: string) => void;
  onSaveMeasurements: (sampleId: string, rows: SampleRow['measurements']) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SampleRow['measurements']>>({});

  const startEdit = (s: SampleRow) => { setExpanded(e => (e === s.id ? null : s.id)); setDrafts(d => ({ ...d, [s.id]: s.measurements })); };
  const updateDraft = (sampleId: string, mId: string, patch: Partial<SampleRow['measurements'][number]>) => {
    setDrafts(d => ({ ...d, [sampleId]: (d[sampleId] || []).map(m => (m.id === mId ? { ...m, ...patch } : m)) }));
  };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-1.5"><FlaskConical className="w-4 h-4" />샘플 검사 (§12)</h2>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5"><Plus className="w-4 h-4" />샘플 추가</Button>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead className="text-muted-foreground"><tr><th className="text-left py-1">항목</th><th className="text-left">평균</th><th className="text-left">최소</th><th className="text-left">최대</th><th className="text-left">n</th></tr></thead>
            <tbody className="divide-y">
              {Object.entries(stats).map(([key, s]) => (
                <tr key={key}>
                  <td className="py-1">{s.itemLabel}</td>
                  <td>{s.avg != null ? `${s.avg.toFixed(2)}${s.unit || ''}` : '-'}</td>
                  <td>{s.min != null ? `${s.min}${s.unit || ''}` : '-'}</td>
                  <td>{s.max != null ? `${s.max}${s.unit || ''}` : '-'}</td>
                  <td>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {samples.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 샘플이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {samples.map(s => (
            <div key={s.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <button onClick={() => startEdit(s)} className="text-xs font-medium hover:underline">{s.sampleNo}</button>
                <button onClick={() => onDelete(s.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {expanded === s.id && (
                <div className="border-t p-3 space-y-2">
                  <table className="w-full text-xs">
                    <tbody className="divide-y">
                      {(drafts[s.id] || []).map(m => (
                        <tr key={m.id}>
                          <td className="py-1 pr-2">{m.itemLabel}</td>
                          <td className="pr-1"><input className="w-20 h-7 border rounded px-1" value={m.measuredValue ?? ''} onChange={e => updateDraft(s.id, m.id, { measuredValue: e.target.value })} /></td>
                          <td className="pr-1"><input className="w-14 h-7 border rounded px-1" placeholder="단위" value={m.unit ?? ''} onChange={e => updateDraft(s.id, m.id, { unit: e.target.value })} /></td>
                          <td>
                            <select className="h-7 border rounded px-1" value={m.judgement ?? ''} onChange={e => updateDraft(s.id, m.id, { judgement: e.target.value })}>
                              <option value="">-</option>
                              {JUDGEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button size="sm" onClick={() => onSaveMeasurements(s.id, drafts[s.id] || [])} className="gap-1.5">저장</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffsPanel({ diffs, dirty, saving, onUpdate, onSave }: {
  diffs: DiffRow[]; dirty: boolean; saving: boolean;
  onUpdate: (diffId: string, patch: Partial<DiffRow>) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-1.5"><GitCompare className="w-4 h-4" />사전승인 대비 비교 (§11)</h2>
        <Button size="sm" onClick={onSave} disabled={saving || !dirty} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}저장</Button>
      </div>
      <p className="text-xs text-muted-foreground">차이가 있다고 표시(판정이 &quot;동일&quot;/&quot;해당 없음&quot;이 아님)한 항목은 변경위치·사유를 반드시 입력해야 저장됩니다.</p>
      <div className="space-y-2">
        {diffs.map(d => {
          const flagged = !!d.judgement && d.judgement !== '동일' && d.judgement !== '해당 없음';
          return (
            <div key={d.id} className={cn('border rounded-lg p-2.5 space-y-2', flagged && 'border-amber-400 bg-amber-50/40')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{d.compareItem}</span>
                <select className="h-7 text-xs border rounded px-1" value={d.judgement ?? ''} onChange={e => onUpdate(d.id, { judgement: e.target.value })}>
                  <option value="">-</option>
                  {DIFF_JUDGEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {flagged && (
                <div className="grid grid-cols-2 gap-2">
                  <input className="h-7 text-xs border rounded px-1.5" placeholder="변경위치 *" value={d.changeLocation ?? ''} onChange={e => onUpdate(d.id, { changeLocation: e.target.value })} />
                  <input className="h-7 text-xs border rounded px-1.5" placeholder="사유 *" value={d.reason ?? ''} onChange={e => onUpdate(d.id, { reason: e.target.value })} />
                  <input className="h-7 text-xs border rounded px-1.5" placeholder="변경 전" value={d.beforeDesc ?? ''} onChange={e => onUpdate(d.id, { beforeDesc: e.target.value })} />
                  <input className="h-7 text-xs border rounded px-1.5" placeholder="변경 후" value={d.afterDesc ?? ''} onChange={e => onUpdate(d.id, { afterDesc: e.target.value })} />
                  <input className="h-7 text-xs border rounded px-1.5 col-span-2" placeholder="공급업체 설명" value={d.supplierExplanation ?? ''} onChange={e => onUpdate(d.id, { supplierExplanation: e.target.value })} />
                  <input className="h-7 text-xs border rounded px-1.5 col-span-2" placeholder="내부 검토의견" value={d.internalReviewOpinion ?? ''} onChange={e => onUpdate(d.id, { internalReviewOpinion: e.target.value })} />
                  <label className="text-[11px] flex items-center gap-1 col-span-2">
                    <input type="checkbox" checked={d.needsApproval} onChange={e => onUpdate(d.id, { needsApproval: e.target.checked })} />승인 필요
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhotoCell({ id, productId, categoryKey, label, photo, onUpload, onDelete, onEdit }: {
  id: string; productId: string; categoryKey: string; label: string; photo: PhotoRow | null;
  onUpload: (file: File) => void;
  onDelete: (photoId: string) => void;
  onEdit: (photoId: string, patch: { rotationDeg?: number; crop?: { x: number; y: number; w: number; h: number } | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const fileUrl = photo ? `/api/approval-inspection/${id}/products/${productId}/photos/${photo.id}/file` : null;

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({ startX: (e.clientX - rect.left) / rect.width, startY: (e.clientY - rect.top) / rect.height });
    setCropDraft(null);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const curY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const x = Math.min(drag.startX, curX), y = Math.min(drag.startY, curY);
    const w = Math.abs(curX - drag.startX), h = Math.abs(curY - drag.startY);
    setCropDraft({ x, y, w, h });
  };
  const onMouseUp = () => setDrag(null);

  return (
    <div className="border rounded-lg p-2 space-y-1.5">
      <p className="text-[11px] font-medium truncate" title={label}>{label}</p>
      {!photo ? (
        <label className="flex flex-col items-center justify-center gap-1 h-28 rounded-md border-2 border-dashed border-input text-muted-foreground hover:text-foreground hover:border-primary cursor-pointer text-[11px]">
          <Upload className="w-4 h-4" />업로드
          <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
      ) : (
        <div className="space-y-1.5">
          <div
            className="relative border rounded overflow-hidden h-28 bg-muted/30 select-none cursor-crosshair"
            onMouseDown={editing ? onMouseDown : undefined} onMouseMove={editing ? onMouseMove : undefined} onMouseUp={editing ? onMouseUp : undefined} onMouseLeave={editing ? onMouseUp : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${fileUrl}${editing ? '' : '?variant=edited'}`} alt="" className="w-full h-full object-contain pointer-events-none" />
            {editing && cropDraft && (
              <div className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                style={{ left: `${cropDraft.x * 100}%`, top: `${cropDraft.y * 100}%`, width: `${cropDraft.w * 100}%`, height: `${cropDraft.h * 100}%` }} />
            )}
          </div>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditing(e => !e); setCropDraft(photo.cropRect); }} className="text-[10px] text-primary hover:underline">
                {editing ? '완료' : '편집'}
              </button>
              {editing && (
                <>
                  <button onClick={() => onEdit(photo.id, { rotationDeg: ((photo.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270 })} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    <RotateCw className="w-3 h-3" />
                  </button>
                  {cropDraft && <button onClick={() => onEdit(photo.id, { crop: cropDraft })} className="text-[10px] text-primary hover:underline">자르기 적용</button>}
                </>
              )}
            </div>
            <button onClick={() => onDelete(photo.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function WireSpecGroup({ role, rows, onAdd, onUpdate, onDelete }: {
  role: 'input' | 'output'; rows: WireSpecRow[];
  onAdd: () => void;
  onUpdate: (wireId: string, patch: Partial<WireSpecRow>) => void;
  onDelete: (wireId: string) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">{WIRE_ROLE_LABEL[role]}</h3>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5 h-7 text-xs"><Plus className="w-3.5 h-3.5" />추가</Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">등록된 {WIRE_ROLE_LABEL[role]} 정보가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((w, idx) => (
            <div key={w.id} className="border rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{WIRE_ROLE_LABEL[role]} {idx + 1}</span>
                <button onClick={() => onDelete(w.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <WireField label="규격" value={w.wireSpec} onChange={v => onUpdate(w.id, { wireSpec: v })} />
                <WireField label="단면적" value={w.conductorArea} onChange={v => onUpdate(w.id, { conductorArea: v })} />
                <WireField label="심선수" value={w.coreCount} onChange={v => onUpdate(w.id, { coreCount: v })} />
                <WireField label="피복재질" value={w.insulationMaterial} onChange={v => onUpdate(w.id, { insulationMaterial: v })} />
                <WireField label="색상" value={w.color} onChange={v => onUpdate(w.id, { color: v })} />
                <WireField label="탈피 길이" value={w.stripLength} onChange={v => onUpdate(w.id, { stripLength: v })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">기준 길이</label>
                  <div className="flex gap-1">
                    <Input className="h-8 text-xs" value={w.baselineLengthValue ?? ''} onChange={e => onUpdate(w.id, { baselineLengthValue: e.target.value })} />
                    <select className="h-8 rounded-md border border-input bg-background px-1 text-xs" value={w.baselineLengthUnit ?? 'mm'} onChange={e => onUpdate(w.id, { baselineLengthUnit: e.target.value })}>
                      {LENGTH_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">측정 길이</label>
                  <div className="flex gap-1">
                    <Input className="h-8 text-xs" value={w.measuredLengthValue ?? ''} onChange={e => onUpdate(w.id, { measuredLengthValue: e.target.value })} />
                    <select className="h-8 rounded-md border border-input bg-background px-1 text-xs" value={w.measuredLengthUnit ?? 'mm'} onChange={e => onUpdate(w.id, { measuredLengthUnit: e.target.value })}>
                      {LENGTH_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <WireField label="말단처리" value={w.endTreatment} onChange={v => onUpdate(w.id, { endTreatment: v })} />
                <WireField label="커넥터 제조사" value={w.connectorManufacturer} onChange={v => onUpdate(w.id, { connectorManufacturer: v })} />
                <WireField label="커넥터 모델" value={w.connectorModel} onChange={v => onUpdate(w.id, { connectorModel: v })} />
                <WireField label="핀 수" value={w.pinCount} onChange={v => onUpdate(w.id, { pinCount: v })} />
                <WireField label="극성" value={w.polarity} onChange={v => onUpdate(w.id, { polarity: v })} />
                <WireField label="비고" value={w.remark} onChange={v => onUpdate(w.id, { remark: v })} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WireField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground mb-0.5 block">{label}</label>
      <Input className="h-8 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
