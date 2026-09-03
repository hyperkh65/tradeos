'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BadgeCheck, Plus, Loader2, Trash2, ArrowLeft, AlertTriangle, Check, Upload, RotateCw, Camera } from 'lucide-react';
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

const JUDGEMENT_OPTIONS = ['적합', '부적합', '조건부 승인', '재검사 필요', '해당 없음'];
const GROUP_LABEL: Record<string, string> = { product: '제품 전체', pcb: 'PCB', wiring: '배선/커넥터' };

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

  const loadPhotos = useCallback(async () => {
    const r = await fetch(`/api/approval-inspection/${id}/products/${productId}/photos`).then(x => x.json());
    setPhotos(r.data ?? []);
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
      await loadPhotos();
    } finally { setLoading(false); }
  }, [id, productId, loadPhotos]);

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
