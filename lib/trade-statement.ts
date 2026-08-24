export interface TradeStatementItem {
  id: string;
  productName: string;
  specification: string;
  unit: string;
  qty: number;
  unitPrice: number;
  amount: number;
  remark: string;
  vatIncluded: boolean; // 화면/계산 전용 옵션 — 출력물(PDF/엑셀)에는 표시하지 않음
}

export function calcTradeStatementTotals(items: TradeStatementItem[]) {
  let supplyAmount = 0;
  let vatAmount = 0;
  for (const it of items) {
    const amount = (it.qty || 0) * (it.unitPrice || 0);
    if (it.vatIncluded) {
      const supply = Math.round(amount / 1.1);
      supplyAmount += supply;
      vatAmount += amount - supply;
    } else {
      supplyAmount += amount;
      vatAmount += Math.round(amount * 0.1);
    }
  }
  return { supplyAmount, vatAmount, totalAmount: supplyAmount + vatAmount };
}
