import { Document, Page, View, Text } from '@react-pdf/renderer';

export interface LedgerEntryPdf {
  date: string; saleBusinessId: string; productName: string; specification: string;
  qty: number; unitPrice: number; amount: number;
}
export interface CompanyLedgerPdfProps {
  companyName: string;
  start: string;
  end: string;
  entries: LedgerEntryPdf[];
}

const cellBase = { padding: '4 6', fontSize: 8 };
const headCell = { ...cellBase, fontSize: 7.5, fontWeight: 700 as const, color: '#444' };
const tableWrap = { border: '1px solid #999', borderRadius: 2, overflow: 'hidden' as const };
const rowStyle = (last: boolean) => ({ flexDirection: 'row' as const, borderBottom: last ? undefined : '1px solid #ddd' });
const div = (last: boolean) => ({ borderRight: last ? undefined : '1px solid #ddd' });

export function CompanyLedgerDoc({ companyName, start, end, entries }: CompanyLedgerPdfProps) {
  type Row =
    | { kind: 'entry'; e: LedgerEntryPdf; cumulative: number }
    | { kind: 'subtotal'; month: string; qtySum: number; amountSum: number; cumulative: number };
  const rows: Row[] = [];
  let cumulative = 0, curMonth = '', monthQty = 0, monthAmount = 0;
  const flush = () => { if (curMonth) rows.push({ kind: 'subtotal', month: curMonth, qtySum: monthQty, amountSum: monthAmount, cumulative }); monthQty = 0; monthAmount = 0; };
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    if (m !== curMonth) { flush(); curMonth = m; }
    cumulative += e.amount; monthQty += e.qty; monthAmount += e.amount;
    rows.push({ kind: 'entry', e, cumulative });
  }
  flush();

  const grandQty = entries.reduce((s, e) => s + e.qty, 0);
  const grandTotal = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={{ fontFamily: 'NotoSansKR', padding: '14mm', fontSize: 9, color: '#171717' }}>
        <Text style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>거래처원장</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 10 }}>거래처: {companyName}</Text>
          <Text style={{ fontSize: 10 }}>기간: {start} ~ {end}</Text>
          <Text style={{ fontSize: 10 }}>총 수량 {grandQty.toLocaleString()} · 총 판매금액 {grandTotal.toLocaleString()}원</Text>
        </View>
        <View style={tableWrap}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f7f7f8', borderBottom: '1px solid #999' }}>
            <Text style={{ ...headCell, ...div(false), width: '10%' }}>날짜</Text>
            <Text style={{ ...headCell, ...div(false), width: '14%' }}>거래번호</Text>
            <Text style={{ ...headCell, ...div(false), width: '26%' }}>품목</Text>
            <Text style={{ ...headCell, ...div(false), width: '18%' }}>규격</Text>
            <Text style={{ ...headCell, ...div(false), width: '8%', textAlign: 'right' }}>수량</Text>
            <Text style={{ ...headCell, ...div(false), width: '12%', textAlign: 'right' }}>단가</Text>
            <Text style={{ ...headCell, ...div(false), width: '12%', textAlign: 'right' }}>금액</Text>
          </View>
          {rows.map((r, i) => r.kind === 'entry' ? (
            <View style={rowStyle(false)} key={i}>
              <Text style={{ ...cellBase, ...div(false), width: '10%' }}>{r.e.date}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '14%' }}>{r.e.saleBusinessId}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '26%' }}>{r.e.productName}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '18%', fontSize: 7 }}>{r.e.specification}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '8%', textAlign: 'right' }}>{r.e.qty.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '12%', textAlign: 'right' }}>{r.e.unitPrice.toLocaleString()}</Text>
              <Text style={{ ...cellBase, width: '12%', textAlign: 'right' }}>{r.e.amount.toLocaleString()}</Text>
            </View>
          ) : (
            <View style={{ ...rowStyle(false), backgroundColor: '#eff6ff' }} key={i}>
              <Text style={{ ...cellBase, ...div(false), width: '68%', fontWeight: 700 }}>{r.month} 월별소계</Text>
              <Text style={{ ...cellBase, ...div(false), width: '8%', textAlign: 'right', fontWeight: 700 }}>{r.qtySum.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '12%' }} />
              <Text style={{ ...cellBase, width: '12%', textAlign: 'right', fontWeight: 700 }}>{r.amountSum.toLocaleString()}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', backgroundColor: '#171717' }}>
            <Text style={{ ...cellBase, ...div(false), width: '68%', color: 'white', fontWeight: 700 }}>총 누적소계</Text>
            <Text style={{ ...cellBase, ...div(false), width: '8%', color: 'white', textAlign: 'right', fontWeight: 700 }}>{grandQty.toLocaleString()}</Text>
            <Text style={{ ...cellBase, ...div(false), width: '12%' }} />
            <Text style={{ ...cellBase, width: '12%', color: 'white', textAlign: 'right', fontWeight: 700 }}>{grandTotal.toLocaleString()}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
