import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface TradeStatementParty {
  bizNo: string; name: string; ceo: string; address: string; bizType: string; bizItem: string;
}
export interface TradeStatementItemPdf {
  productName: string; specification: string; unit: string; qty: number; unitPrice: number; amount: number; remark: string;
}
export interface TradeStatementCustomPdfProps {
  docNo: string;
  issueDate: string;
  supplier: TradeStatementParty;
  customer: TradeStatementParty;
  items: TradeStatementItemPdf[];
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  systemTotalAmount: number | null;
  stampPath?: string | null;
}

const fmt = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');

const tableWrap = { border: '1px solid #999', borderRadius: 2, overflow: 'hidden' as const };
const rowStyle = (last: boolean) => ({ flexDirection: 'row' as const, borderBottom: last ? undefined : '1px solid #ddd' });
const cellDivider = (last: boolean) => ({ borderRight: last ? undefined : '1px solid #ddd' });
const cellBase = { padding: '4 6', fontSize: 8 };
const labelCell = { ...cellBase, backgroundColor: '#f7f7f8', fontWeight: 700 as const, width: '17%', fontSize: 7.5, textAlign: 'center' as const };
const headRow = { flexDirection: 'row' as const, backgroundColor: '#f7f7f8', borderBottom: '1px solid #999' };
const headCell = { ...cellBase, fontSize: 7.5, fontWeight: 700 as const, color: '#444' };

function PartyBlock(p: { title: string; party: TradeStatementParty }) {
  return (
    <View style={{ ...tableWrap, flex: 1 }}>
      <View style={rowStyle(false)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}>{p.title}</Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>등록번호</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.bizNo}</Text>
      </View>
      <View style={rowStyle(false)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}> </Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>상 호</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.name}</Text>
      </View>
      <View style={rowStyle(false)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}> </Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>대표자</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.ceo}</Text>
      </View>
      <View style={rowStyle(false)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}> </Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>주 소</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.address}</Text>
      </View>
      <View style={rowStyle(false)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}> </Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>업 태</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.bizType}</Text>
      </View>
      <View style={rowStyle(true)}>
        <Text style={{ ...labelCell, ...cellDivider(false) }}> </Text>
        <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', fontWeight: 700 }}>종 목</Text>
        <Text style={{ ...cellBase, flex: 1 }}>{p.party.bizItem}</Text>
      </View>
    </View>
  );
}

export function TradeStatementCustomDoc(p: TradeStatementCustomPdfProps) {
  const mismatch = p.systemTotalAmount != null && Math.round(p.systemTotalAmount) !== Math.round(p.totalAmount);

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '14mm', fontSize: 9, color: '#171717' }}>
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: 900, letterSpacing: 4 }}>거 래 명 세 표</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 8.5, color: '#555' }}>번호 : {p.docNo}</Text>
          <Text style={{ fontSize: 8.5, color: '#555' }}>일자 : {p.issueDate}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          <PartyBlock title="공급자" party={p.supplier} />
          <PartyBlock title="공급받는자" party={p.customer} />
        </View>

        <View style={{ ...tableWrap, marginBottom: 10 }}>
          <View style={headRow}>
            <Text style={{ ...headCell, ...cellDivider(false), width: '6%', textAlign: 'center' }}>No</Text>
            <Text style={{ ...headCell, ...cellDivider(false), flex: 1 }}>품 명 / 규 격</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '8%', textAlign: 'center' }}>단위</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '10%', textAlign: 'right' }}>수량</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '13%', textAlign: 'right' }}>단가</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '15%', textAlign: 'right' }}>금액</Text>
            <Text style={{ ...headCell, width: '14%', textAlign: 'center' }}>비고</Text>
          </View>
          {p.items.map((it, i) => (
            <View style={rowStyle(false)} key={i}>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '6%', textAlign: 'center' }}>{i + 1}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), flex: 1 }}>
                {it.productName}{it.specification ? `  (${it.specification})` : ''}
              </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '8%', textAlign: 'center' }}>{it.unit}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '10%', textAlign: 'right' }}>{it.qty.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '13%', textAlign: 'right' }}>{fmt(it.unitPrice)}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', textAlign: 'right' }}>{fmt(it.amount)}</Text>
              <Text style={{ ...cellBase, width: '14%', fontSize: 7, color: '#555' }}>{it.remark}</Text>
            </View>
          ))}
          {/* 빈 줄로 한 페이지 여백 확보 (품목이 적을 때도 표 형태 유지) */}
          {Array.from({ length: Math.max(0, 14 - p.items.length) }).map((_, i) => (
            <View style={rowStyle(false)} key={`blank-${i}`}>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '6%' }}> </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), flex: 1 }}> </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '8%' }}> </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '10%' }}> </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '13%' }}> </Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '15%' }}> </Text>
              <Text style={{ ...cellBase, width: '14%' }}> </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', ...tableWrap, marginBottom: 6 }}>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '16%', backgroundColor: '#f7f7f8', fontWeight: 700, textAlign: 'center' }}>공급가액</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right', fontWeight: 700 }}>{fmt(p.supplyAmount)}</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '16%', backgroundColor: '#f7f7f8', fontWeight: 700, textAlign: 'center' }}>부가세</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right', fontWeight: 700 }}>{fmt(p.vatAmount)}</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '16%', backgroundColor: '#f7f7f8', fontWeight: 700, textAlign: 'center' }}>합 계</Text>
          <Text style={{ ...cellBase, width: '18%', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmt(p.totalAmount)}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: 700, marginRight: 4 }}>{p.supplier.name}</Text>
            {p.stampPath && <Image src={p.stampPath} style={{ width: 150, opacity: 0.9, transform: 'rotate(-5deg)' }} />}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 10 }}>인수자 :                     (인)</Text>
          </View>
        </View>

        <View style={{ borderTop: '1px solid #ddd', paddingTop: 6 }}>
          <Text style={{ fontSize: 7.5, color: mismatch ? '#dc2626' : '#888' }}>
            ※ 본 명세표의 합계금액을 당사 전산 매출금액과 반드시 대조 확인하시기 바랍니다.
            {p.systemTotalAmount != null ? `  (전산 매출금액: ${fmt(p.systemTotalAmount)}원${mismatch ? ' — 본 명세표 금액과 차이가 있습니다' : ''})` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
