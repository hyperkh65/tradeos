import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { fmt } from './styles';

export interface SaleItem { product: string; specification?: string; qty: number; unitPrice: number; amount: number; remark?: string }

export interface SalesStatementProps {
  businessId: string;
  saleDate: string;
  saleType: string;
  poNo?: string;
  customer: string;
  salesperson?: string;
  misc?: string;
  items: SaleItem[];
  netAmount: number;
  vat: number;
  total: number;
  company: Record<string, string>;
  customerCo?: { business_no?: string; ceo?: string; address?: string; phone?: string };
  stampPath?: string | null;
}

const MIN_ROWS = 10;

export function SalesStatementDoc(p: SalesStatementProps) {
  const emptyRows = Math.max(0, MIN_ROWS - p.items.length);

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '9mm', fontSize: 9, color: '#111' }}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: 800, letterSpacing: 12, color: '#222' }}>거 래 명 세 표</Text>
          <Text style={{ fontSize: 8.5, color: '#888', marginTop: 4, letterSpacing: 1 }}>TRANSACTION STATEMENT</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, fontSize: 8.5, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Text><Text style={{ color: '#888' }}>문서번호 </Text><Text style={{ fontWeight: 700 }}>{p.businessId}</Text></Text>
            <Text><Text style={{ color: '#888' }}>거래일자 </Text><Text style={{ fontWeight: 700 }}>{p.saleDate}</Text></Text>
            <Text><Text style={{ color: '#888' }}>거래유형 </Text><Text style={{ fontWeight: 700 }}>{p.saleType}</Text></Text>
          </View>
          {!!p.poNo && <Text><Text style={{ color: '#888' }}>PO# </Text><Text style={{ fontWeight: 700 }}>{p.poNo}</Text></Text>}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6 }}>
            <Text style={{ textAlign: 'center', fontWeight: 600, fontSize: 8, backgroundColor: '#f5f5f5', padding: 6, borderBottom: '1px solid #ddd', letterSpacing: 4, color: '#444' }}>공 급 자</Text>
            <View style={{ padding: 10, fontSize: 8 }}>
              <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>상호</Text><Text style={{ fontWeight: 700, fontSize: 10 }}>{p.company.name}</Text></View>
              {!!p.company.bizNo && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>사업자번호</Text><Text>{p.company.bizNo}</Text></View>}
              {!!p.company.ceo && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>대표자</Text><Text>{p.company.ceo}</Text></View>}
              {!!p.company.address && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>주소</Text><Text style={{ fontSize: 7.5, flex: 1 }}>{p.company.address}</Text></View>}
              {!!p.company.tel && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>전화</Text><Text>{p.company.tel}</Text></View>}
            </View>
          </View>
          <View style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6 }}>
            <Text style={{ textAlign: 'center', fontWeight: 600, fontSize: 8, backgroundColor: '#f5f5f5', padding: 6, borderBottom: '1px solid #ddd', letterSpacing: 3, color: '#444' }}>공 급 받 는 자</Text>
            <View style={{ padding: 10, fontSize: 8 }}>
              <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>상호</Text><Text style={{ fontWeight: 700, fontSize: 12 }}>{p.customer}</Text></View>
              {!!p.customerCo?.business_no && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>사업자번호</Text><Text>{p.customerCo.business_no}</Text></View>}
              {!!p.customerCo?.ceo && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>대표자</Text><Text>{p.customerCo.ceo}</Text></View>}
              {!!p.customerCo?.address && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>주소</Text><Text style={{ fontSize: 7.5, flex: 1 }}>{p.customerCo.address}</Text></View>}
              {!!p.customerCo?.phone && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>전화</Text><Text>{p.customerCo.phone}</Text></View>}
              {!!p.salesperson && <View style={{ flexDirection: 'row', marginBottom: 3 }}><Text style={{ color: '#888', width: 70 }}>담당자</Text><Text>{p.salesperson}</Text></View>}
            </View>
          </View>
        </View>

        <View style={{ borderTop: '1px solid #ddd', borderLeft: '1px solid #ddd', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ width: 24, textAlign: 'center', padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>No</Text>
            <Text style={{ flex: 1, padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>품목 및 규격</Text>
            <Text style={{ width: 44, textAlign: 'right', padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>수량</Text>
            <Text style={{ width: 68, textAlign: 'right', padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>단가</Text>
            <Text style={{ width: 72, textAlign: 'right', padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>공급가액</Text>
            <Text style={{ width: 68, padding: 8, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 8.5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>비고</Text>
          </View>
          {p.items.map((item, i) => (
            <View style={{ flexDirection: 'row' }} key={i} wrap={false}>
              <Text style={{ width: 24, textAlign: 'center', color: '#888', padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{i + 1}</Text>
              <View style={{ flex: 1, padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
                <Text style={{ fontWeight: 600 }}>{item.product}</Text>
                {!!item.specification && <Text style={{ fontSize: 7.5, color: '#666', marginTop: 1 }}>{item.specification}</Text>}
              </View>
              <Text style={{ width: 44, textAlign: 'right', padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{fmt(item.qty)}</Text>
              <Text style={{ width: 68, textAlign: 'right', padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{fmt(item.unitPrice)}</Text>
              <Text style={{ width: 72, textAlign: 'right', fontWeight: 600, padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{fmt(item.amount)}</Text>
              <Text style={{ width: 68, fontSize: 7.5, color: '#555', padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{item.remark || ''}</Text>
            </View>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View style={{ flexDirection: 'row' }} key={`e${i}`}>
              <Text style={{ width: 24, height: 14, textAlign: 'center', color: '#bbb', padding: 6, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{p.items.length + i + 1}</Text>
              {[44, 68, 72, 68].map((w, j) => (
                <Text key={j} style={j === 0 ? { flex: 1, height: 14, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' } : { width: w, height: 14, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }} />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5', borderTop: '2px solid #ccc' }}>
            <Text style={{ width: 24 + 0, flex: 1, textAlign: 'right', fontWeight: 700, padding: 6, borderRight: '1px solid #e0e0e0' }}>합 계</Text>
            <Text style={{ width: 44 + 68, borderRight: '1px solid #e0e0e0' }} />
            <Text style={{ width: 72, textAlign: 'right', fontWeight: 700, padding: 6, borderRight: '1px solid #e0e0e0' }}>{fmt(p.netAmount)}</Text>
            <Text style={{ width: 68 }} />
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          <View style={{ backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, minWidth: 260 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, fontSize: 9 }}>
              <Text style={{ color: '#666' }}>공급가액</Text><Text style={{ fontWeight: 700 }}>{fmt(p.netAmount)}원</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, fontSize: 9 }}>
              <Text style={{ color: '#666' }}>부가세 (10%)</Text><Text style={{ fontWeight: 700 }}>{fmt(p.vat)}원</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTop: '2px solid #ddd', paddingTop: 12, fontSize: 15, fontWeight: 800 }}>
              <Text>합계금액</Text><Text>{fmt(p.total)}원</Text>
            </View>
          </View>
        </View>

        {!!p.misc && (
          <View style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 16 }}>
            <Text style={{ fontWeight: 600, color: '#888', marginBottom: 4, fontSize: 7.5 }}>기타 사항</Text>
            <Text style={{ fontSize: 8.5 }}>{p.misc}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
          {p.company.bank ? (
            <View style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, fontSize: 8, flex: 1, marginRight: 20 }}>
              <Text style={{ fontWeight: 600, color: '#888', marginBottom: 6, fontSize: 7.5 }}>입금 계좌</Text>
              <Text>{p.company.bank}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 8 }}>{p.company.name} (인)</Text>
            {p.stampPath ? (
              <Image src={p.stampPath} style={{ width: 70, opacity: 0.8, transform: 'rotate(-5deg)' }} />
            ) : (
              <View style={{ width: 70, height: 70, border: '2px dashed #ccc', borderRadius: 35, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 7.5, color: '#aaa' }}>도장</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ marginTop: 30, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#999' }}>
          <Text>발행: {new Date().toLocaleDateString('ko-KR')}</Text>
          <Text>이 문서는 전자 문서입니다.</Text>
        </View>
      </Page>
    </Document>
  );
}
