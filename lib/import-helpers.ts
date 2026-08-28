import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { syncIndexOnWrite, syncIndexOnDelete } from '@/lib/ai/sync';

type Db = ReturnType<typeof getDb>;

interface ImportExpenseFields {
  duty?: number;
  vat?: number;
  brokerFee?: number;
  inspectionFee?: number;
  warehouseFee?: number;
  detentionFee?: number;
  demurrage?: number;
  inlandFreight?: number;
  brokerFeeVatRate?: number;
  warehouseFeeVatRate?: number;
  demurrageVatRate?: number;
  detentionFeeVatRate?: number;
  inlandFreightVatRate?: number;
  freightKrw?: number;
  freightHandling?: { name: string; currency: string; amtCur: number; exRate: number; amtKrw: number; vat: number; includedInCif?: boolean }[];
  customCosts?: { name: string; amount: number; vatRate?: number }[];
  createdBy?: string;
  // 추가 컨텍스트
  shipmentId?: string;
  shipmentBusinessId?: string;
  importBusinessId?: string;
  incurredDate?: string;
}

const COST_TYPE_MAP: Record<string, string> = {
  '관세':                    'duty',
  '수입부가세':              'vat',
  '통관비':                  'customs_broker',
  '세관검사비':              'inspection',
  'Terminal Storage(장치료)': 'warehouse',
  'Demurrage/DEM(체화료)':   'demurrage',
  'Detention/DET(지체료)':   'detention',
  '내륙운송비':              'inland_freight',
  '해상운임':                'ocean_freight',
  '부대비용(포워더)':        'ocean_freight',
  '포워더 매입VAT':          'vat',
};

export function syncImportExpenses(
  db: Db,
  importId: string,
  importBusinessId: string,
  fields: ImportExpenseFields,
) {
  // 해상운임 + 부대비용 공급가 합산 / VAT 별도 분리
  const handlingSurcharge = (fields.freightHandling || [])
    .filter(h => h.amtKrw > 0)
    .reduce((s, h) => s + h.amtKrw, 0);
  const handlingVat = (fields.freightHandling || [])
    .filter(h => (h.vat || 0) > 0)
    .reduce((s, h) => s + h.vat, 0);
  const totalFreight = (fields.freightKrw || 0) + handlingSurcharge;

  // 국내비용 VAT (각 항목별 VAT율 적용)
  const brokerVatRate    = (fields.brokerFeeVatRate ?? 10) / 100;
  const warehouseVatRate = (fields.warehouseFeeVatRate ?? 10) / 100;
  const demurrageVatRate = (fields.demurrageVatRate ?? 0) / 100;
  const detentionVatRate = (fields.detentionFeeVatRate ?? 0) / 100;
  const inlandVatRate    = (fields.inlandFreightVatRate ?? 10) / 100;

  const brokerVat    = Math.round((fields.brokerFee || 0) * brokerVatRate);
  const warehouseVat = Math.round((fields.warehouseFee || 0) * warehouseVatRate);
  const demurrageVat = Math.round((fields.demurrage || 0) * demurrageVatRate);
  const detentionVat = Math.round((fields.detentionFee || 0) * detentionVatRate);
  const inlandVat    = Math.round((fields.inlandFreight || 0) * inlandVatRate);

  // 비용원장은 입출금 추적용 → VAT를 공급가에 합산해서 한 행으로 표시
  // 회계전표의 부가세 분리는 정산서(settlement items) 기반으로 처리
  // 해상운임 + 부대비용(공급가+VAT) 모두 합산 — 포워더에게 한 번에 지급
  const totalFreightAll = totalFreight + handlingVat;

  const entries: { cat: string; amt: number | undefined }[] = [
    { cat: '해상운임',                amt: totalFreightAll > 0 ? totalFreightAll : undefined },
    { cat: '관세',                    amt: fields.duty },
    { cat: '수입부가세',              amt: fields.vat },
    { cat: '통관비',                  amt: (fields.brokerFee || 0) + brokerVat || undefined },
    { cat: '세관검사비',              amt: fields.inspectionFee },
    { cat: 'Terminal Storage(장치료)', amt: (fields.warehouseFee || 0) + warehouseVat || undefined },
    { cat: 'Demurrage/DEM(체화료)',   amt: (fields.demurrage || 0) + demurrageVat || undefined },
    { cat: 'Detention/DET(지체료)',   amt: (fields.detentionFee || 0) + detentionVat || undefined },
    { cat: '내륙운송비',              amt: (fields.inlandFreight || 0) + inlandVat || undefined },
    ...(fields.customCosts || []).filter(c => c.name && c.amount > 0).map(c => {
      const vatRate = c.vatRate ?? 10;
      const vatAmt  = vatRate > 0 ? Math.round(c.amount * vatRate / 100) : 0;
      return { cat: c.name, amt: c.amount + vatAmt };
    }),
  ];

  const ts = now();
  const incurredDate = fields.incurredDate || ts.slice(0, 10);

  const oldExpenseIds = (db.prepare(
    "SELECT id FROM expenses WHERE related_type='import' AND related_id=?"
  ).all(importId) as { id: string }[]).map(r => r.id);
  const newExpenseIds: string[] = [];

  const sync = db.transaction(() => {
    // 기존 expenses/cost_records 삭제 후 재삽입 (atomic)
    db.prepare("DELETE FROM expenses WHERE related_type='import' AND related_id=?").run(importId);
    db.prepare("DELETE FROM cost_records WHERE import_id=? AND is_auto_allocated=1").run(importId);

    for (const { cat, amt } of entries) {
      if (!amt || amt <= 0) continue;

      const expId = newId();
      const expBizId = nextBizId('EXP');
      db.prepare(`INSERT OR REPLACE INTO expenses
        (id,business_id,category,description,amount,currency,amount_krw,related_type,related_id,related_name,status,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(expId, expBizId, cat, `${importBusinessId} ${cat}`, amt, 'KRW', amt, 'import', importId, importBusinessId, 'pending', fields.createdBy || 'unknown', ts);
      newExpenseIds.push(expId);

      const crId = newId();
      const crBizId = nextBizId('CST');
      const costType = COST_TYPE_MAP[cat] || 'other';
      db.prepare(`INSERT OR REPLACE INTO cost_records
        (id,business_id,cost_type,description,
         import_id,import_business_id,shipment_id,shipment_business_id,
         cost_amount,cost_currency,fx_rate_at_cost,cost_amount_krw,
         incurred_date,disposition,bill_status,
         linked_expense_id,is_auto_allocated,
         created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          crId, crBizId, costType, `${importBusinessId} ${cat}`,
          importId, importBusinessId,
          fields.shipmentId ?? null, fields.shipmentBusinessId ?? null,
          amt, 'KRW', 1, amt,
          incurredDate, 'pending', 'unbilled',
          expId, 1,
          fields.createdBy || 'unknown', ts, ts,
        );
    }
  });
  sync();

  for (const oldId of oldExpenseIds) syncIndexOnDelete('expense', oldId);
  for (const eid of newExpenseIds) syncIndexOnWrite('expense', eid);
}

export function updateLinkedShipmentStatus(db: Db, shipmentId: string | undefined, importStatus: string) {
  if (!shipmentId) return;
  let newStatus: string | null = null;
  if (importStatus === 'in_progress' || importStatus === 'declared') {
    newStatus = 'customs';
  } else if (importStatus === 'released' || importStatus === 'completed') {
    newStatus = 'completed';
  }
  if (newStatus) {
    db.prepare("UPDATE shipments SET status=?, updated_at=? WHERE id=? AND status NOT IN ('completed')").run(newStatus, now(), shipmentId);
  }
}
