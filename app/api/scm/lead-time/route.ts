import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

interface PORow {
  id: string; business_id: string; supplier_id: string; supplier_name: string;
  order_date: string | null; production_due_date: string | null; inspection_date: string | null; etd: string | null;
}
interface ShipmentRow { id: string; business_id: string; po_ids_json: string; etd: string | null; eta: string | null }
interface ImportRow { id: string; shipment_id: string; release_date: string | null }

interface LeadTimeStage { label: string; key: string; days: number | null }
interface PoChain {
  poId: string; poBusinessId: string; supplierName: string;
  shipmentBusinessId?: string; importReleaseDate?: string;
  stages: LeadTimeStage[];
  totalDays: number | null;
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime(), d2 = new Date(b).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  const diff = Math.round((d2 - d1) / 86400000);
  return diff >= 0 ? diff : null; // 역순(데이터 오류)이면 무시
}

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const db = getDb();
  const pos = db.prepare(`SELECT id, business_id, supplier_id, supplier_name, order_date, production_due_date, inspection_date, etd
    FROM purchase_orders`).all() as PORow[];
  const shipments = db.prepare(`SELECT id, business_id, po_ids_json, etd, eta FROM shipments WHERE local_deleted=0`).all() as ShipmentRow[];
  const imports = db.prepare(`SELECT id, shipment_id, release_date FROM imports`).all() as ImportRow[];

  const poById = new Map(pos.map(p => [p.id, p]));
  const importByShipment = new Map<string, ImportRow>();
  for (const imp of imports) if (imp.release_date) importByShipment.set(imp.shipment_id, imp);

  // PO id -> 이 PO를 포함하는 첫 선적 (한 PO가 여러 선적에 나뉘는 경우는 첫 매칭만 사용)
  const shipmentByPoId = new Map<string, ShipmentRow>();
  for (const sh of shipments) {
    let poIds: string[] = [];
    try { poIds = JSON.parse(sh.po_ids_json || '[]'); } catch { /* ignore */ }
    for (const poId of poIds) if (!shipmentByPoId.has(poId)) shipmentByPoId.set(poId, sh);
  }

  const chains: PoChain[] = [];
  for (const po of pos) {
    const sh = shipmentByPoId.get(po.id);
    const imp = sh ? importByShipment.get(sh.id) : undefined;
    const stages: LeadTimeStage[] = [
      { key: 'order_to_production', label: '발주→생산완료', days: daysBetween(po.order_date, po.production_due_date) },
      { key: 'production_to_inspection', label: '생산완료→검품', days: daysBetween(po.production_due_date, po.inspection_date) },
      { key: 'inspection_to_etd', label: '검품→선적(출항)', days: daysBetween(po.inspection_date, sh?.etd ?? po.etd) },
      { key: 'etd_to_eta', label: '출항→도착', days: sh ? daysBetween(sh.etd, sh.eta) : null },
      { key: 'eta_to_release', label: '도착→통관완료', days: sh && imp ? daysBetween(sh.eta, imp.release_date) : null },
    ];
    const totalDays = daysBetween(po.order_date, imp?.release_date ?? null);
    // 하나라도 실제 값이 있는 PO만 포함 (완전히 빈 건 제외)
    if (stages.every(s => s.days === null) && totalDays === null) continue;
    chains.push({
      poId: po.id, poBusinessId: po.business_id, supplierName: po.supplier_name,
      shipmentBusinessId: sh?.business_id, importReleaseDate: imp?.release_date ?? undefined,
      stages, totalDays,
    });
  }

  // 공급업체별 평균 집계
  const bySupplier = new Map<string, { count: number; stageSum: Record<string, number>; stageCount: Record<string, number>; totalSum: number; totalCount: number }>();
  for (const c of chains) {
    const key = c.supplierName || '(미지정)';
    if (!bySupplier.has(key)) bySupplier.set(key, { count: 0, stageSum: {}, stageCount: {}, totalSum: 0, totalCount: 0 });
    const agg = bySupplier.get(key)!;
    agg.count++;
    for (const s of c.stages) {
      if (s.days == null) continue;
      agg.stageSum[s.key] = (agg.stageSum[s.key] || 0) + s.days;
      agg.stageCount[s.key] = (agg.stageCount[s.key] || 0) + 1;
    }
    if (c.totalDays != null) { agg.totalSum += c.totalDays; agg.totalCount++; }
  }

  const stageKeys = ['order_to_production', 'production_to_inspection', 'inspection_to_etd', 'etd_to_eta', 'eta_to_release'];
  const stageLabels: Record<string, string> = {
    order_to_production: '발주→생산완료', production_to_inspection: '생산완료→검품',
    inspection_to_etd: '검품→선적', etd_to_eta: '출항→도착', eta_to_release: '도착→통관완료',
  };
  const suppliers = Array.from(bySupplier.entries()).map(([supplierName, agg]) => ({
    supplierName,
    poCount: agg.count,
    stages: stageKeys.map(k => ({
      key: k, label: stageLabels[k],
      avgDays: agg.stageCount[k] ? Math.round((agg.stageSum[k] / agg.stageCount[k]) * 10) / 10 : null,
      sampleCount: agg.stageCount[k] || 0,
    })),
    avgTotalDays: agg.totalCount ? Math.round((agg.totalSum / agg.totalCount) * 10) / 10 : null,
    totalSampleCount: agg.totalCount,
  })).sort((a, b) => (b.avgTotalDays ?? -1) - (a.avgTotalDays ?? -1));

  return NextResponse.json({ data: { suppliers, chains: chains.sort((a, b) => (b.totalDays ?? -1) - (a.totalDays ?? -1)).slice(0, 50) } });
}
