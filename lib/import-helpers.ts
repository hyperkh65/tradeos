import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';

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
  customCosts?: { name: string; amount: number }[];
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
};

export function syncImportExpenses(
  db: Db,
  importId: string,
  importBusinessId: string,
  fields: ImportExpenseFields,
) {
  const entries: { cat: string; amt: number | undefined }[] = [
    { cat: '관세',                    amt: fields.duty },
    { cat: '수입부가세',              amt: fields.vat },
    { cat: '통관비',                  amt: fields.brokerFee },
    { cat: '세관검사비',              amt: fields.inspectionFee },
    { cat: 'Terminal Storage(장치료)', amt: fields.warehouseFee },
    { cat: 'Demurrage/DEM(체화료)',   amt: fields.demurrage },
    { cat: 'Detention/DET(지체료)',   amt: fields.detentionFee },
    { cat: '내륙운송비',              amt: fields.inlandFreight },
    ...(fields.customCosts || []).filter(c => c.name && c.amount > 0).map(c => ({ cat: c.name, amt: c.amount })),
  ];

  const ts = now();
  const incurredDate = fields.incurredDate || ts.slice(0, 10);

  const sync = db.transaction(() => {
    // 기존 expenses/cost_records 삭제 후 재삽입 (atomic)
    db.prepare("DELETE FROM expenses WHERE related_type='import' AND related_id=?").run(importId);
    db.prepare("DELETE FROM cost_records WHERE import_id=? AND is_auto_allocated=1").run(importId);

    for (const { cat, amt } of entries) {
      if (!amt || amt <= 0) continue;

      const expId = newId();
      const expBizId = nextBizId('EXP');
      db.prepare(`INSERT INTO expenses
        (id,business_id,category,description,amount,currency,amount_krw,related_type,related_id,related_name,status,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(expId, expBizId, cat, `${importBusinessId} ${cat}`, amt, 'KRW', amt, 'import', importId, importBusinessId, 'pending', fields.createdBy || 'unknown', ts);

      const crId = newId();
      const crBizId = nextBizId('CST');
      const costType = COST_TYPE_MAP[cat] || 'other';
      db.prepare(`INSERT INTO cost_records
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
