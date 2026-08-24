import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export type PaySideCurrency = 'KRW' | 'USD' | 'CNY';
export interface SettlementItemPdf { name: string; qty: number; unitPriceCny: number }
export interface PaySidePdf { currency: PaySideCurrency; amount: number; exchangeRate: number; note: string }
export interface SettlementPdfProps {
  businessId: string;
  issueDate: string;
  customerName: string;
  customerCeo: string;
  productName: string;
  deliveryLocation: string;
  paymentCondition: string;
  paymentMethod: string;
  items: SettlementItemPdf[];
  advance: PaySidePdf;
  balance: PaySidePdf;
  company: Record<string, string>;
  companyLogoPath?: string | null;
  stampPath?: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const fmtCny = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const noVatOf = (p: PaySidePdf) => p.currency === 'KRW' ? Math.round(p.amount) : Math.round(p.amount * p.exchangeRate);

// 표 전체를 한 번만 감싸고(border), 셀은 오른쪽/아래쪽 선만 그려서 겹선(이중선)이 안 생기게 한다.
const tableWrap = { border: '1px solid #999', borderRadius: 2, overflow: 'hidden' as const };
const rowStyle = (last: boolean) => ({ flexDirection: 'row' as const, borderBottom: last ? undefined : '1px solid #ddd' });
const headRow = { flexDirection: 'row' as const, backgroundColor: '#f7f7f8', borderBottom: '1px solid #999' };
const cellBase = { padding: '5 7', fontSize: 8.5 };
const cellDivider = (last: boolean) => ({ borderRight: last ? undefined : '1px solid #ddd' });
const headCell = { ...cellBase, fontSize: 8, fontWeight: 700, color: '#444' };

export function ImportCostSettlementDoc(p: SettlementPdfProps) {
  const totalQty = p.items.reduce((s, i) => s + (i.qty || 0), 0);
  const totalCny = p.items.reduce((s, i) => s + (i.qty || 0) * (i.unitPriceCny || 0), 0);
  const advNoVat = noVatOf(p.advance);
  const advVat = Math.round(advNoVat * 1.1);
  const balNoVat = noVatOf(p.balance);
  const balVat = Math.round(balNoVat * 1.1);
  const totalKrwPayBase = advNoVat + balNoVat;
  const advRatio = totalKrwPayBase > 0 ? Math.round((advNoVat / totalKrwPayBase) * 100) : 0;

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '14mm', fontSize: 9, color: '#171717' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #171717', paddingBottom: 10, marginBottom: 12 }}>
          {p.companyLogoPath
            ? <Image src={p.companyLogoPath} style={{ height: 28, objectFit: 'contain' }} />
            : <Text style={{ fontSize: 18, fontWeight: 900 }}>{p.company.name}</Text>}
          <Text style={{ fontSize: 15, fontWeight: 700 }}>수입물품대금비용정산서</Text>
          <Text style={{ fontSize: 8, color: '#888' }}>{p.businessId}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 9.5 }}>아래와 같이 수입물품대금비용 정산내역을 안내드립니다.</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7.5, color: '#555' }}>대표이사 : {p.company.ceo}</Text>
            {!!p.company.address && <Text style={{ fontSize: 7.5, color: '#555' }}>주소 : {p.company.address}</Text>}
            <Text style={{ fontSize: 7.5, color: '#555' }}>TEL: {p.company.tel}  FAX: {p.company.fax}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 9, textAlign: 'right', color: '#888', marginBottom: 12 }}>{p.issueDate}</Text>

        <View style={{ ...tableWrap, marginBottom: 10 }}>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>품 명</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '35%' }}>{p.productName}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>고 객 사</Text>
            <Text style={{ ...cellBase, width: '35%' }}>{p.customerName}</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>수 량</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '35%' }}>{totalQty.toLocaleString()} 개</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>대표이사</Text>
            <Text style={{ ...cellBase, width: '35%' }}>{p.customerCeo}</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>입 고 지</Text>
            <Text style={{ ...cellBase, width: '85%' }}>{p.deliveryLocation}</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>지급조건</Text>
            <Text style={{ ...cellBase, width: '85%' }}>{p.paymentCondition}</Text>
          </View>
          <View style={rowStyle(true)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', backgroundColor: '#f7f7f8', fontWeight: 700 }}>지급수단</Text>
            <Text style={{ ...cellBase, width: '85%' }}>{p.paymentMethod}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', ...tableWrap, backgroundColor: '#eff6ff', marginBottom: 14 }}>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', fontWeight: 700 }}>보 증 금</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '35%', fontWeight: 700 }}>KRW {fmt(advVat)}</Text>
          <Text style={{ ...cellBase, ...cellDivider(false), width: '15%', fontWeight: 700 }}>정 산 액</Text>
          <Text style={{ ...cellBase, width: '35%', fontWeight: 700, color: '#1d4ed8' }}>KRW {fmt(balVat)}</Text>
        </View>

        <Text style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 5 }}>물품 내역</Text>
        <View style={{ ...tableWrap, marginBottom: 12 }}>
          <View style={headRow}>
            <Text style={{ ...headCell, ...cellDivider(false), flex: 1 }}>품목</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '18%', textAlign: 'right' }}>수량(PCS)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '18%', textAlign: 'right' }}>단가(CNY)</Text>
            <Text style={{ ...headCell, width: '18%', textAlign: 'right' }}>금액(CNY)</Text>
          </View>
          {p.items.map((it, i) => (
            <View style={rowStyle(false)} key={i}>
              <Text style={{ ...cellBase, ...cellDivider(false), flex: 1 }}>{it.name}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '18%', textAlign: 'right' }}>{it.qty.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...cellDivider(false), width: '18%', textAlign: 'right' }}>{fmtCny(it.unitPriceCny)}</Text>
              <Text style={{ ...cellBase, width: '18%', textAlign: 'right' }}>{fmtCny(it.qty * it.unitPriceCny)}</Text>
            </View>
          ))}
          <View style={{ ...rowStyle(true), backgroundColor: '#f7f7f8' }}>
            <Text style={{ ...cellBase, ...cellDivider(false), flex: 1, fontWeight: 700 }}>합계</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '18%', textAlign: 'right', fontWeight: 700 }}>{totalQty.toLocaleString()}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '18%' }} />
            <Text style={{ ...cellBase, width: '18%', textAlign: 'right', fontWeight: 700 }}>{fmtCny(totalCny)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 5 }}>정산 내역</Text>
        <View style={{ ...tableWrap, marginBottom: 12 }}>
          <View style={headRow}>
            <Text style={{ ...headCell, ...cellDivider(false), width: '14%', textAlign: 'center' }}>적요</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '20%', textAlign: 'right' }}>금액</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '13%', textAlign: 'right' }}>환율</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '26%', textAlign: 'right' }}>부가세제외(KRW)</Text>
            <Text style={{ ...headCell, width: '27%', textAlign: 'right' }}>부가세포함(KRW)</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '14%' }}>선 금</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '20%', textAlign: 'right' }}>{p.advance.currency} {fmtCny(p.advance.amount)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '13%', textAlign: 'right' }}>{p.advance.currency === 'KRW' ? '-' : p.advance.exchangeRate}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', textAlign: 'right' }}>{fmt(advNoVat)}</Text>
            <Text style={{ ...cellBase, width: '27%', textAlign: 'right' }}>{fmt(advVat)}</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '14%' }}>잔 금</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '20%', textAlign: 'right' }}>{p.balance.currency} {fmtCny(p.balance.amount)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '13%', textAlign: 'right' }}>{p.balance.currency === 'KRW' ? '-' : p.balance.exchangeRate}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', textAlign: 'right' }}>{fmt(balNoVat)}</Text>
            <Text style={{ ...cellBase, width: '27%', textAlign: 'right' }}>{fmt(balVat)}</Text>
          </View>
          <View style={{ ...rowStyle(true), backgroundColor: '#f7f7f8' }}>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '14%', fontWeight: 700 }}>합 계</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '20%' }} />
            <Text style={{ ...cellBase, ...cellDivider(false), width: '13%' }} />
            <Text style={{ ...cellBase, ...cellDivider(false), width: '26%', textAlign: 'right', fontWeight: 700 }}>{fmt(advNoVat + balNoVat)}</Text>
            <Text style={{ ...cellBase, width: '27%', textAlign: 'right', fontWeight: 700 }}>{fmt(advVat + balVat)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 5 }}>계산서 내역</Text>
        <View style={{ ...tableWrap, marginBottom: 18 }}>
          <View style={headRow}>
            <Text style={{ ...headCell, ...cellDivider(false), flex: 1 }}>적요</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '17%', textAlign: 'right' }}>공급가(₩)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '17%', textAlign: 'right' }}>부가세(₩)</Text>
            <Text style={{ ...headCell, ...cellDivider(false), width: '17%', textAlign: 'right' }}>금액(₩)</Text>
            <Text style={{ ...headCell, width: '17%' }}>비고</Text>
          </View>
          <View style={rowStyle(false)}>
            <Text style={{ ...cellBase, ...cellDivider(false), flex: 1 }}>{p.productName} {totalQty.toLocaleString()}개 보증금 {advRatio}%</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(advNoVat)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(advVat - advNoVat)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(advVat)}</Text>
            <Text style={{ ...cellBase, width: '17%', fontSize: 7.5, color: '#555' }}>{p.advance.note}</Text>
          </View>
          <View style={rowStyle(true)}>
            <Text style={{ ...cellBase, ...cellDivider(false), flex: 1 }}>{p.productName} {totalQty.toLocaleString()}개 잔금 {100 - advRatio}%</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(balNoVat)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(balVat - balNoVat)}</Text>
            <Text style={{ ...cellBase, ...cellDivider(false), width: '17%', textAlign: 'right' }}>{fmt(balVat)}</Text>
            <Text style={{ ...cellBase, width: '17%', fontSize: 7.5, color: '#555' }}>{p.balance.note}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 9, marginBottom: 24 }}>위와 같이 수입물품대금비용 정산서를 작성함.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 700, marginRight: 4 }}>{p.company.name}</Text>
            {p.stampPath && <Image src={p.stampPath} style={{ width: 90, opacity: 0.9, transform: 'rotate(-5deg)' }} />}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 4 }}>확인</Text>
            <Text style={{ fontSize: 10.5, fontWeight: 700 }}>{p.customerName}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
