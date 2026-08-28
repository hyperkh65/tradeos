export interface SettlementItem {
  id: string;
  productName: string;
  qty: number;
  unitPriceRmb: number;
  /** null이면 환산금액(KRW)의 10%로 자동계산, 값이 있으면 그 값을 그대로 씀 —
   * 실제 세금계산서/통관 부가세가 10% 계산과 약간씩 다를 수 있어 수기 조정을 허용한다. */
  vatKrwOverride: number | null;
  remark: string;
}

export interface SettlementItemComputed extends SettlementItem {
  balanceRmb: number;
  convertedKrw: number;
  vatKrw: number;
  totalKrw: number;
}

export function computeSettlementItem(it: SettlementItem, exchangeRate: number): SettlementItemComputed {
  const balanceRmb = (it.qty || 0) * (it.unitPriceRmb || 0);
  const convertedKrw = Math.round(balanceRmb * (exchangeRate || 0));
  const vatKrw = it.vatKrwOverride != null ? it.vatKrwOverride : Math.round(convertedKrw * 0.1);
  return { ...it, balanceRmb, convertedKrw, vatKrw, totalKrw: convertedKrw + vatKrw };
}

export function calcSettlementTotals(items: SettlementItem[], exchangeRate: number) {
  const computed = items.map(it => computeSettlementItem(it, exchangeRate));
  return {
    computed,
    totals: computed.reduce((acc, it) => ({
      qty: acc.qty + (it.qty || 0),
      balanceRmb: acc.balanceRmb + it.balanceRmb,
      convertedKrw: acc.convertedKrw + it.convertedKrw,
      vatKrw: acc.vatKrw + it.vatKrw,
      totalKrw: acc.totalKrw + it.totalKrw,
    }), { qty: 0, balanceRmb: 0, convertedKrw: 0, vatKrw: 0, totalKrw: 0 }),
  };
}

export function emptySettlementItem(): SettlementItem {
  return { id: Date.now().toString() + Math.random().toString(36).slice(2), productName: '', qty: 0, unitPriceRmb: 0, vatKrwOverride: null, remark: '' };
}
