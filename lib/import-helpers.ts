import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';

type Db = ReturnType<typeof getDb>;

interface ImportExpenseFields {
  duty?: number;
  vat?: number;
  brokerFee?: number;
  inspectionFee?: number;
  warehouseFee?: number;
  detentionFee?: number;
  inlandFreight?: number;
  customCosts?: { name: string; amount: number }[];
  createdBy?: string;
}

export function syncImportExpenses(
  db: Db,
  importId: string,
  importBusinessId: string,
  fields: ImportExpenseFields,
) {
  db.prepare("DELETE FROM expenses WHERE related_type='import' AND related_id=?").run(importId);

  const entries: { cat: string; amt: number | undefined }[] = [
    { cat: '관세',       amt: fields.duty },
    { cat: '수입부가세', amt: fields.vat },
    { cat: '통관비',     amt: fields.brokerFee },
    { cat: '세관검사비', amt: fields.inspectionFee },
    { cat: '창고비',     amt: fields.warehouseFee },
    { cat: '억류비',     amt: fields.detentionFee },
    { cat: '내륙운송비', amt: fields.inlandFreight },
    ...(fields.customCosts || []).filter(c => c.name && c.amount > 0).map(c => ({ cat: c.name, amt: c.amount })),
  ];

  const ts = now();
  for (const { cat, amt } of entries) {
    if (!amt || amt <= 0) continue;
    const id = newId();
    const bizId = nextBizId('EXP');
    db.prepare(`INSERT INTO expenses
      (id,business_id,category,description,amount,currency,amount_krw,related_type,related_id,related_name,status,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, cat, `${importBusinessId} ${cat}`, amt, 'KRW', amt, 'import', importId, importBusinessId, 'pending', fields.createdBy || 'unknown', ts);
  }
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
