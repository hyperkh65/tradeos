import { Document, Page, View, Text } from '@react-pdf/renderer';

export interface SettlementItemPdf {
  productName: string; qty: number; unitPriceRmb: number; remark: string;
  balanceRmb: number; convertedKrw: number; vatKrw: number; totalKrw: number;
}
export interface SettlementStatementPdfProps {
  title: string;
  issueDate: string;
  exchangeRate: number;
  items: SettlementItemPdf[];
  note: string;
  totals: { qty: number; balanceRmb: number; convertedKrw: number; vatKrw: number; totalKrw: number };
}

const fmt = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
const fmt2 = (n: number) => (n || 0).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tableWrap = { border: '1px solid #999', borderRadius: 2, overflow: 'hidden' as const };
const rowStyle = (last: boolean) => ({ flexDirection: 'row' as const, borderBottom: last ? undefined : '1px solid #ddd' });
const cellDivider = (last: boolean) => ({ borderRight: last ? undefined : '1px solid #ddd' });
const cellBase = { padding: '4 5', fontSize: 8 };
const headRow = { flexDirection: 'row' as const, backgroundColor: '#fffdcc', borderBottom: '1px solid #999' };
const headCell = { ...cellBase, fontSize: 7.5, fontWeight: 700 as const, textAlign: 'center' as const };
const totalRow = { flexDirection: 'row' as const, backgroundColor: '#c6efce', borderBottom: '1px solid #999' };
const totalCell = { ...cellBase, fontSize: 8, fontWeight: 700 as const, color: '#006100' };

const COLS = [
  { w: '20%', align: 'left' as const },   // 품목
  { w: '8%', align: 'right' as const },   // 수량
  { w: '8%', align: 'right' as const },   // 단가(RMB)
  { w: '10%', align: 'right' as const },  // 잔금(RMB)
  { w: '7%', align: 'right' as const },   // 적용환율
  { w: '12%', align: 'right' as const },  // 환산금액(KRW)
  { w: '11%', align: 'right' as const },  // 환산금액(KRW,부가세)
  { w: '12%', align: 'right' as const },  // 환산금액(부가세포함,KRW)
  { w: '12%', align: 'left' as const },   // 비고
];

export function SettlementStatementDoc(p: SettlementStatementPdfProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={{ fontFamily: 'NotoSansKR', padding: '12mm', fontSize: 9, color: '#171717' }}>
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: 900 }}>{p.title || '정산내역'}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 8.5, color: '#555' }}>일자 : {p.issueDate}</Text>
          <Text style={{ fontSize: 8.5, color: '#555' }}>적용환율 : {fmt2(p.exchangeRate)}</Text>
        </View>

        <View style={tableWrap}>
          <View style={headRow}>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[0].w, textAlign: 'center' }}>품목</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[1].w }}>수량{'\n'}(Set)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[2].w }}>단가{'\n'}(RMB)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[3].w }}>잔금{'\n'}(100%, RMB)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[4].w }}>적용{'\n'}환율</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[5].w }}>환산금액{'\n'}(KRW)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[6].w }}>환산금액{'\n'}(KRW, 부가세)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: COLS[7].w }}>환산금액{'\n'}(부가세포함, KRW)</Text>
            <Text style={{ ...headCell, width: COLS[8].w }}>비고</Text>
          </View>

          <View style={totalRow}>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[0].w }}>합계</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[1].w, textAlign: 'right' }}>{p.totals.qty.toLocaleString()}</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[2].w, textAlign: 'right' }}>N/A</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[3].w, textAlign: 'right' }}>{fmt2(p.totals.balanceRmb)}</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[4].w, textAlign: 'right' }}>{fmt2(p.exchangeRate)}</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[5].w, textAlign: 'right' }}>{fmt(p.totals.convertedKrw)}</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[6].w, textAlign: 'right' }}>{fmt(p.totals.vatKrw)}</Text>
            <Text style={{ ...totalCell, ...cellDivider(false), width: COLS[7].w, textAlign: 'right' }}>{fmt(p.totals.totalKrw)}</Text>
            <Text style={{ ...totalCell, width: COLS[8].w }}> </Text>
          </View>

          {p.items.map((it, i) => (
            <View style={rowStyle(i === p.items.length - 1)} key={i}>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[0].w }}>{it.productName}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[1].w, textAlign: 'right' }}>{it.qty.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[2].w, textAlign: 'right' }}>{fmt2(it.unitPriceRmb)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[3].w, textAlign: 'right' }}>{fmt2(it.balanceRmb)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[4].w, textAlign: 'right' }}>{fmt2(p.exchangeRate)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[5].w, textAlign: 'right' }}>{fmt(it.convertedKrw)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[6].w, textAlign: 'right' }}>{fmt(it.vatKrw)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: COLS[7].w, textAlign: 'right' }}>{fmt(it.totalKrw)}</Text>
              <Text style={{ ...cellBase, width: COLS[8].w, fontSize: 7, color: '#555' }}>{it.remark}</Text>
            </View>
          ))}
        </View>

        {p.note ? <Text style={{ fontSize: 8, color: '#666', marginTop: 8 }}>{p.note}</Text> : null}
      </Page>
    </Document>
  );
}
