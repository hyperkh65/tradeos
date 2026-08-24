import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface SettlementItemPdf { name: string; qty: number; unitPriceCny: number }
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
  advance: { amountCny: number; exchangeRate: number; note: string };
  balance: { amountCny: number; exchangeRate: number; note: string };
  company: Record<string, string>;
  stampPath?: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const fmtCny = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const th = { padding: '4 6', fontSize: 8, fontWeight: 700, backgroundColor: '#f5f5f5', border: '0.5px solid #999' };
const td = { padding: '4 6', fontSize: 8.5, border: '0.5px solid #999' };

export function ImportCostSettlementDoc(p: SettlementPdfProps) {
  const totalQty = p.items.reduce((s, i) => s + (i.qty || 0), 0);
  const totalCny = p.items.reduce((s, i) => s + (i.qty || 0) * (i.unitPriceCny || 0), 0);
  const advNoVat = Math.round(p.advance.amountCny * p.advance.exchangeRate);
  const advVat = Math.round(advNoVat * 1.1);
  const balNoVat = Math.round(p.balance.amountCny * p.balance.exchangeRate);
  const balVat = Math.round(balNoVat * 1.1);
  const totalCnyPay = p.advance.amountCny + p.balance.amountCny;
  const advRatio = totalCnyPay > 0 ? Math.round((p.advance.amountCny / totalCnyPay) * 100) : 0;

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '14mm', fontSize: 9, color: '#171717' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #171717', paddingBottom: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: 900 }}>{p.company.name?.includes('와이엔케이') ? 'YNK' : p.company.name}</Text>
          <Text style={{ fontSize: 15, fontWeight: 700 }}>수입물품대금비용정산서</Text>
          <Text style={{ fontSize: 8, color: '#888' }}>{p.businessId}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 9.5 }}>아래와 같이 수입물품대금비용 정산내역을 안내드립니다.</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7.5, color: '#555' }}>대표이사 : {p.company.ceo}</Text>
            {!!p.company.address && <Text style={{ fontSize: 7.5, color: '#555' }}>주소 : {p.company.address}</Text>}
            <Text style={{ fontSize: 7.5, color: '#555' }}>TEL: {p.company.tel}  FAX: {p.company.fax}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 9, textAlign: 'center', marginBottom: 10 }}>{p.issueDate}</Text>

        <View style={{ border: '0.5px solid #999', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>품 명</Text>
            <Text style={{ ...td, width: '35%' }}>{p.productName}</Text>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>고 객 사</Text>
            <Text style={{ ...td, width: '35%' }}>{p.customerName}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>수 량</Text>
            <Text style={{ ...td, width: '35%' }}>{totalQty.toLocaleString()} 개</Text>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>대표이사</Text>
            <Text style={{ ...td, width: '35%' }}>{p.customerCeo}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>입 고 지</Text>
            <Text style={{ ...td, width: '85%' }}>{p.deliveryLocation}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>지급조건</Text>
            <Text style={{ ...td, width: '85%' }}>{p.paymentCondition}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '15%', backgroundColor: '#f5f5f5', fontWeight: 700 }}>지급수단</Text>
            <Text style={{ ...td, width: '85%' }}>{p.paymentMethod}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', border: '0.5px solid #999', backgroundColor: '#eff6ff', marginBottom: 12 }}>
          <Text style={{ ...td, width: '15%', fontWeight: 700, backgroundColor: 'transparent' }}>보 증 금</Text>
          <Text style={{ ...td, width: '35%', fontWeight: 700, backgroundColor: 'transparent' }}>KRW {fmt(advVat)}</Text>
          <Text style={{ ...td, width: '15%', fontWeight: 700, backgroundColor: 'transparent' }}>정 산 액</Text>
          <Text style={{ ...td, width: '35%', fontWeight: 700, color: '#1d4ed8', backgroundColor: 'transparent' }}>KRW {fmt(balVat)}</Text>
        </View>

        <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>물품 내역</Text>
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...th, width: '15%', textAlign: 'center' }}>항목</Text>
            <Text style={{ ...th, flex: 1 }}>품목</Text>
            <Text style={{ ...th, width: '15%', textAlign: 'right' }}>수량(PCS)</Text>
            <Text style={{ ...th, width: '15%', textAlign: 'right' }}>단가(CNY)</Text>
            <Text style={{ ...th, width: '15%', textAlign: 'right' }}>금액(CNY)</Text>
          </View>
          {p.items.map((it, i) => (
            <View style={{ flexDirection: 'row' }} key={i}>
              <Text style={{ ...td, width: '15%' }} />
              <Text style={{ ...td, flex: 1 }}>{it.name}</Text>
              <Text style={{ ...td, width: '15%', textAlign: 'right' }}>{it.qty.toLocaleString()}</Text>
              <Text style={{ ...td, width: '15%', textAlign: 'right' }}>{fmtCny(it.unitPriceCny)}</Text>
              <Text style={{ ...td, width: '15%', textAlign: 'right' }}>{fmtCny(it.qty * it.unitPriceCny)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
            <Text style={{ ...td, width: '15%', fontWeight: 700 }}>합계</Text>
            <Text style={{ ...td, flex: 1 }} />
            <Text style={{ ...td, width: '15%', textAlign: 'right', fontWeight: 700 }}>{totalQty.toLocaleString()}</Text>
            <Text style={{ ...td, width: '15%' }} />
            <Text style={{ ...td, width: '15%', textAlign: 'right', fontWeight: 700 }}>{fmtCny(totalCny)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>정산 내역</Text>
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...th, width: '16%', textAlign: 'center' }}>적요</Text>
            <Text style={{ ...th, width: '17%', textAlign: 'right' }}>금액(CNY)</Text>
            <Text style={{ ...th, width: '13%', textAlign: 'right' }}>환율</Text>
            <Text style={{ ...th, width: '27%', textAlign: 'right' }}>금액(KRW) 부가세제외</Text>
            <Text style={{ ...th, width: '27%', textAlign: 'right' }}>금액(KRW) 부가세포함</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '16%' }}>선 금</Text>
            <Text style={{ ...td, width: '17%', textAlign: 'right' }}>{fmtCny(p.advance.amountCny)}</Text>
            <Text style={{ ...td, width: '13%', textAlign: 'right' }}>{p.advance.exchangeRate}</Text>
            <Text style={{ ...td, width: '27%', textAlign: 'right' }}>{fmt(advNoVat)}</Text>
            <Text style={{ ...td, width: '27%', textAlign: 'right' }}>{fmt(advVat)}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, width: '16%' }}>잔 금</Text>
            <Text style={{ ...td, width: '17%', textAlign: 'right' }}>{fmtCny(p.balance.amountCny)}</Text>
            <Text style={{ ...td, width: '13%', textAlign: 'right' }}>{p.balance.exchangeRate}</Text>
            <Text style={{ ...td, width: '27%', textAlign: 'right' }}>{fmt(balNoVat)}</Text>
            <Text style={{ ...td, width: '27%', textAlign: 'right' }}>{fmt(balVat)}</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
            <Text style={{ ...td, width: '16%', fontWeight: 700 }}>합 계</Text>
            <Text style={{ ...td, width: '17%', textAlign: 'right', fontWeight: 700 }}>{fmtCny(totalCnyPay)}</Text>
            <Text style={{ ...td, width: '13%' }} />
            <Text style={{ ...td, width: '27%', textAlign: 'right', fontWeight: 700 }}>{fmt(advNoVat + balNoVat)}</Text>
            <Text style={{ ...td, width: '27%', textAlign: 'right', fontWeight: 700 }}>{fmt(advVat + balVat)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>계산서 내역</Text>
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...th, flex: 1 }}>적요</Text>
            <Text style={{ ...th, width: '18%', textAlign: 'right' }}>공급가(₩)</Text>
            <Text style={{ ...th, width: '18%', textAlign: 'right' }}>부가세(₩)</Text>
            <Text style={{ ...th, width: '18%', textAlign: 'right' }}>금액(₩)</Text>
            <Text style={{ ...th, width: '18%' }}>비고</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, flex: 1 }}>{p.productName} {totalQty.toLocaleString()}개 보증금 {advRatio}%</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(advNoVat)}</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(advVat - advNoVat)}</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(advVat)}</Text>
            <Text style={{ ...td, width: '18%' }}>{p.advance.note}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...td, flex: 1 }}>{p.productName} {totalQty.toLocaleString()}개 잔금 {100 - advRatio}%</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(balNoVat)}</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(balVat - balNoVat)}</Text>
            <Text style={{ ...td, width: '18%', textAlign: 'right' }}>{fmt(balVat)}</Text>
            <Text style={{ ...td, width: '18%' }}>{p.balance.note}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 9, marginBottom: 20 }}>위와 같이 수입물품대금비용 정산서를 작성함.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: 700 }}>{p.company.name}</Text>
            {p.stampPath && <Image src={p.stampPath} style={{ width: 42, opacity: 0.85, transform: 'rotate(-5deg)' }} />}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 4 }}>확인</Text>
            <Text style={{ fontSize: 10, fontWeight: 700 }}>{p.customerName}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
