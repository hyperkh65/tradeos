import { getDb } from '@/lib/db/sqlite';

export interface OrderTrackingItem {
  itemId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  amount: number;
  soldQty: number; // 기준시점(있는 경우) 이후 누적 판매수량, 없으면 전체 누적 판매수량
  remainingQty: number;
  adjustment: { cutoverDate: string; remainingQty: number; note: string | null; updatedAt: string } | null;
}
export interface OrderTrackingPO {
  poId: string;
  poBusinessId: string;
  piNumber: string;
  supplierId: string;
  supplierName: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  currency: string;
  status: string;
  items: OrderTrackingItem[];
  totalOrderedQty: number;
  totalRemainingQty: number;
  totalConsumedQty: number;
  totalAmount: number;
  progressPct: number | null;
}

export function computeOrderTracking(): OrderTrackingPO[] {
  const db = getDb();
  const poRows = db.prepare(`SELECT * FROM purchase_orders ORDER BY order_date DESC`).all() as Record<string, unknown>[];
  const saleRows = db.prepare(`SELECT sale_date, items_json FROM sales`).all() as { sale_date: string; items_json: string }[];
  const adjRows = db.prepare(`SELECT * FROM po_qty_adjustments`).all() as Record<string, unknown>[];

  const adjByKey = new Map<string, Record<string, unknown>>();
  for (const a of adjRows) adjByKey.set(`${a.po_id}::${a.item_id}`, a);

  // "poId::productName" -> [{qty, date}] (판매 품목이 어느 PO에서 왔는지는 poId + 제품명으로 매칭)
  const soldByPoProduct = new Map<string, { qty: number; date: string }[]>();
  for (const s of saleRows) {
    let items: Array<{ poId?: string; product?: string; qty?: number }> = [];
    try { items = JSON.parse(s.items_json || '[]'); } catch { /* ignore */ }
    for (const it of items) {
      if (!it.poId) continue;
      const key = `${it.poId}::${it.product || ''}`;
      const arr = soldByPoProduct.get(key) || [];
      arr.push({ qty: Number(it.qty) || 0, date: s.sale_date || '' });
      soldByPoProduct.set(key, arr);
    }
  }

  return poRows.map(row => {
    let items: Array<{ id?: string | number; productName?: string; qty?: number; quantity?: number; unitPrice?: number; amount?: number }> = [];
    try { items = JSON.parse((row.items_json as string) || '[]'); } catch { /* ignore */ }

    const outItems: OrderTrackingItem[] = items.map((it, idx) => {
      const itemId = it.id != null ? String(it.id) : String(idx);
      const productName = it.productName || '';
      const qty = Number(it.qty || it.quantity || 0);
      const unitPrice = Number(it.unitPrice || 0);
      const amount = Number(it.amount || qty * unitPrice);
      const adj = adjByKey.get(`${row.id}::${itemId}`);
      const salesForItem = soldByPoProduct.get(`${row.id}::${productName}`) || [];

      let soldQty: number, remainingQty: number, adjustment: OrderTrackingItem['adjustment'] = null;
      if (adj) {
        const cutoverDate = adj.cutover_date as string;
        const salesSinceCutover = salesForItem
          .filter(s => s.date > cutoverDate)
          .reduce((sum, s) => sum + s.qty, 0);
        soldQty = salesSinceCutover;
        remainingQty = Math.max(0, (adj.remaining_qty as number) - salesSinceCutover);
        adjustment = {
          cutoverDate,
          remainingQty: adj.remaining_qty as number,
          note: (adj.note as string) || null,
          updatedAt: adj.updated_at as string,
        };
      } else {
        soldQty = salesForItem.reduce((sum, s) => sum + s.qty, 0);
        remainingQty = Math.max(0, qty - soldQty);
      }

      return { itemId, productName, qty, unitPrice, amount, soldQty, remainingQty, adjustment };
    });

    const totalOrderedQty = outItems.reduce((s, i) => s + i.qty, 0);
    const totalRemainingQty = outItems.reduce((s, i) => s + i.remainingQty, 0);
    const totalConsumedQty = Math.max(0, totalOrderedQty - totalRemainingQty);
    const totalAmount = outItems.reduce((s, i) => s + i.amount, 0);

    return {
      poId: row.id as string,
      poBusinessId: row.business_id as string,
      piNumber: (row.pi_number as string) || '',
      supplierId: (row.supplier_id as string) || '',
      supplierName: (row.supplier_name as string) || '',
      customerId: (row.customer_id as string) || '',
      customerName: (row.customer_name as string) || '',
      orderDate: row.order_date as string,
      currency: (row.currency as string) || 'USD',
      status: (row.status as string) || 'draft',
      items: outItems,
      totalOrderedQty, totalRemainingQty, totalConsumedQty, totalAmount,
      progressPct: totalOrderedQty > 0 ? Math.round((totalConsumedQty / totalOrderedQty) * 1000) / 10 : null,
    };
  });
}
