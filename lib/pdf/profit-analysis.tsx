import { Document, Page, View, Text } from '@react-pdf/renderer';

function fmt(n: number) { return Math.round(n).toLocaleString('ko-KR'); }

// 컬럼 폭 비율 (엑셀 정산서: 항목38 / 수량12 / KRW20 / RMB16 / 비고10)
const COL = { item: '40%', qty: '12%', krw: '21%', rmb: '17%', note: '10%' };

const cell = (bg?: string) => ({
  padding: '4 6', fontSize: 8.5, border: '0.5px solid #999',
  ...(bg ? { backgroundColor: bg } : {}),
});

function Row({ children, bg }: { children: React.ReactNode; bg?: string }) {
  return <View style={{ flexDirection: 'row', backgroundColor: bg }}>{children}</View>;
}

export interface ProductItemRow { label: string; qty: number; krw: number | null; rmb: number | null }
export interface CostDetailRow { label: string; val: number }

export interface ProfitAnalysisPdfProps {
  businessId: string;
  title: string;
  analysisDate: string;
  customerName?: string;
  supplierName?: string;
  importBusinessId?: string;
  saleAmount: number;
  customsExRate: number;
  wireExRate: number;
  productItems: ProductItemRow[];
  productTotalKrw: number;
  productTotalRmb: number;
  logisticTotal: number;
  costDetails: CostDetailRow[];
  vatImport: number;
  profit: number;
  profitRate: number;
  totalCost: number;
  advancePayment: number;
  effectivePayment: number;
  paymentIsFromProductCost: boolean;
  actualPayment: number;
}

export function ProfitAnalysisDoc(p: ProfitAnalysisPdfProps) {
  const positive = p.profit >= 0;
  const profitFill = positive ? '#EFF6FF' : '#FEF2F2';
  const profitColor = positive ? '#1D4ED8' : '#DC2626';
  const deliveryLabel = p.analysisDate ? `${p.analysisDate.slice(0, 4)}년 ${parseInt(p.analysisDate.slice(5, 7), 10)}월 납품분` : '';
  const showExRate = p.customsExRate > 1 || p.wireExRate > 1;

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '12mm', fontSize: 9, color: '#171717' }}>
        <View style={{ border: '1px solid #999' }}>
          {/* 헤더 */}
          <Row bg="#E8EAF6">
            <Text style={{ ...cell(), width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 11, paddingVertical: 6 }}>
              {p.customerName ? `${p.customerName} / ` : ''}수익분석 예상 {p.analysisDate} 납품
            </Text>
          </Row>
          <Row bg="#F5F5F5">
            <Text style={{ ...cell(), width: '100%', textAlign: 'center', fontWeight: 700, paddingVertical: 4 }}>{p.title}</Text>
          </Row>
          <Row bg="#DDDDDD">
            <Text style={{ ...cell(), width: COL.item, textAlign: 'center', fontWeight: 700 }}>항목</Text>
            <Text style={{ ...cell(), width: COL.qty, textAlign: 'center', fontWeight: 700 }}>수량</Text>
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'center', fontWeight: 700 }}>KRW</Text>
            <Text style={{ ...cell(), width: COL.rmb, textAlign: 'center', fontWeight: 700 }}>RMB</Text>
            <Text style={{ ...cell(), width: COL.note, textAlign: 'center', fontWeight: 700 }}>비고</Text>
          </Row>

          {/* 1. 매출금액 */}
          <Row>
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>1. 매출금액  원{deliveryLabel ? `  (${deliveryLabel})` : ''}</Text>
            <Text style={{ ...cell(), width: COL.qty }} />
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', fontWeight: 700 }}>{fmt(p.saleAmount)}</Text>
            <Text style={{ ...cell(), width: COL.rmb }} />
            <Text style={{ ...cell(), width: COL.note, textAlign: 'center', color: '#888', fontSize: 7.5 }}>부가세 별도</Text>
          </Row>

          {/* 2. 비용 */}
          <Row bg="#F5F5F5"><Text style={{ ...cell(), width: '100%', fontWeight: 700 }}>2. 비용</Text></Row>

          {p.productItems.length > 0 && (
            <>
              <Row bg="#FAFAFA">
                <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>  2-1) 제품공가{p.supplierName ? `  ${p.supplierName}` : ''}</Text>
                <Text style={{ ...cell(), width: COL.qty, textAlign: 'center', color: '#888' }}>수량</Text>
                <Text style={{ ...cell(), width: COL.krw }} />
                <Text style={{ ...cell(), width: COL.rmb }} />
                <Text style={{ ...cell(), width: COL.note }} />
              </Row>
              {showExRate && (
                <Row bg="#FFFBEB">
                  <Text style={{ ...cell(), width: '100%', color: '#B45309', fontSize: 8 }}>
                    {'  '}적용환율 — ①통관: {p.customsExRate.toLocaleString()}원/CNY    ②송금: {p.wireExRate !== p.customsExRate ? `${p.wireExRate.toLocaleString()}원/CNY` : '①과 동일'}{p.importBusinessId ? `    (${p.importBusinessId})` : ''}
                  </Text>
                </Row>
              )}
              {p.productItems.map((it, i) => (
                <Row key={i}>
                  <Text style={{ ...cell(), width: COL.item }}>{'    '}{it.label}</Text>
                  <Text style={{ ...cell(), width: COL.qty, textAlign: 'center' }}>{it.qty}</Text>
                  <Text style={{ ...cell(), width: COL.krw, textAlign: 'right' }}>{it.krw != null ? fmt(it.krw) : ''}</Text>
                  <Text style={{ ...cell(), width: COL.rmb, textAlign: 'right' }}>{it.rmb != null ? `¥ ${it.rmb.toFixed(2)}` : ''}</Text>
                  <Text style={{ ...cell(), width: COL.note }} />
                </Row>
              ))}
              <Row bg="#FEFCE8">
                <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>    제품원가 소계 (②송금환율 기준)</Text>
                <Text style={{ ...cell(), width: COL.qty }} />
                <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', fontWeight: 700 }}>{fmt(p.productTotalKrw)}</Text>
                <Text style={{ ...cell(), width: COL.rmb, textAlign: 'right' }}>{p.productTotalRmb > 0 ? `¥ ${p.productTotalRmb.toFixed(2)}` : ''}</Text>
                <Text style={{ ...cell(), width: COL.note }} />
              </Row>
            </>
          )}

          <Row><Text style={{ ...cell(), width: '100%', height: 8 }} /></Row>

          <Row bg="#F5F5F5">
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>  2) 비용 합계</Text>
            <Text style={{ ...cell(), width: COL.qty }} />
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', fontWeight: 700 }}>{fmt(p.logisticTotal)}</Text>
            <Text style={{ ...cell(), width: COL.rmb }} />
            <Text style={{ ...cell(), width: COL.note, textAlign: 'center', color: '#888', fontSize: 7.5 }}>부가세 제외</Text>
          </Row>
          {p.costDetails.map((c, i) => (
            <Row key={i}>
              <Text style={{ ...cell(), width: COL.item }}>{'    '}{c.label}</Text>
              <Text style={{ ...cell(), width: COL.qty }} />
              <Text style={{ ...cell(), width: COL.krw, textAlign: 'right' }}>{c.val > 0 ? fmt(c.val) : ''}</Text>
              <Text style={{ ...cell(), width: COL.rmb }} />
              <Text style={{ ...cell(), width: COL.note }} />
            </Row>
          ))}
          {p.vatImport > 0 && (
            <Row>
              <Text style={{ ...cell(), width: COL.item, color: '#888' }}>{'    '}부가세 (별도)</Text>
              <Text style={{ ...cell(), width: COL.qty }} />
              <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', color: '#888' }}>{fmt(p.vatImport)}</Text>
              <Text style={{ ...cell(), width: COL.rmb }} />
              <Text style={{ ...cell(), width: COL.note, textAlign: 'center', color: '#888', fontSize: 7 }}>별도/불포함</Text>
            </Row>
          )}

          <Row><Text style={{ ...cell(), width: '100%', height: 8 }} /></Row>

          {/* 3. 수익 */}
          <Row bg={profitFill}>
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>3. 수익</Text>
            <Text style={{ ...cell(), width: COL.qty }} />
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', fontWeight: 700, color: profitColor, fontSize: 10 }}>{positive ? '' : '-'}{fmt(Math.abs(p.profit))}</Text>
            <Text style={{ ...cell(), width: COL.rmb }} />
            <Text style={{ ...cell(), width: COL.note, textAlign: 'center', color: '#888', fontSize: 7.5 }}>부가세 별도</Text>
          </Row>
          <Row bg={profitFill} >
            <View style={{ opacity: 0.55, flexDirection: 'row', width: '100%' }}>
              <Text style={{ ...cell(), width: COL.item, textAlign: 'right', fontWeight: 700, color: profitColor, border: 'none' }}>{p.profitRate.toFixed(2)}</Text>
              <Text style={{ ...cell(), width: COL.qty, color: profitColor, border: 'none' }}>수익률 %</Text>
              <Text style={{ ...cell(), width: '48%', color: '#888', fontSize: 7.5, border: 'none' }}>매출 {fmt(p.saleAmount)} − 총비용 {fmt(p.totalCost)}</Text>
            </View>
          </Row>

          <Row><Text style={{ ...cell(), width: '100%', height: 8 }} /></Row>

          {/* 4. 선지급비용 */}
          <Row>
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>4. 선지급비용</Text>
            <Text style={{ ...cell(), width: COL.qty, textAlign: 'center', color: '#888', fontSize: 7.5 }}>보증금 등</Text>
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right' }}>{p.advancePayment > 0 ? fmt(p.advancePayment) : ''}</Text>
            <Text style={{ ...cell(), width: COL.rmb }} />
            <Text style={{ ...cell(), width: COL.note }}>원</Text>
          </Row>

          {/* 5. 지급액 */}
          <Row>
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>5. 지급액</Text>
            <Text style={{ ...cell(), width: COL.qty, textAlign: 'center', color: '#888', fontSize: 7.5 }}>총 청구액</Text>
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right' }}>{p.effectivePayment > 0 ? fmt(p.effectivePayment) : ''}</Text>
            <Text style={{ ...cell(), width: COL.rmb, fontSize: 7, color: '#888' }}>{p.paymentIsFromProductCost ? '(제품원가② 기준)' : ''}</Text>
            <Text style={{ ...cell(), width: COL.note }}>원</Text>
          </Row>

          {/* 6. 실지급액 */}
          <Row bg="#FFF7ED">
            <Text style={{ ...cell(), width: COL.item, fontWeight: 700 }}>6. 실지급액</Text>
            <Text style={{ ...cell(), width: COL.qty, textAlign: 'center', color: '#888', fontSize: 7.5 }}>⑤−④</Text>
            <Text style={{ ...cell(), width: COL.krw, textAlign: 'right', fontWeight: 700, color: '#EA580C' }}>{p.actualPayment !== 0 ? fmt(p.actualPayment) : ''}</Text>
            <Text style={{ ...cell(), width: COL.rmb }} />
            <Text style={{ ...cell(), width: COL.note }}>원</Text>
          </Row>
        </View>

        <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#999' }}>
          <Text>{p.businessId} · 발행: {new Date().toLocaleDateString('ko-KR')}</Text>
          <Text>이 문서는 전자 문서입니다.</Text>
        </View>
      </Page>
    </Document>
  );
}
