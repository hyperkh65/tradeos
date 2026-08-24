import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles, fmt } from './styles';

export interface POItem { productName: string; specification?: string; unit?: string; qty: number; unitPrice: number; amount: number }

export interface PurchaseOrderPdfProps {
  businessId: string;
  piNumber?: string;
  orderDate: string;
  supplierName: string;
  incoterm?: string;
  productionDueDate?: string;
  inspectionDate?: string;
  etd?: string;
  currency: string;
  items: POItem[];
  total: number;
  paymentTerms?: string;
  depositRatio: number;
  depositAmt: number;
  balanceAmt: number;
  remark?: string;
}

function fmtCur(n: number | undefined, currency: string) {
  if (!n) return '-';
  return currency === 'KRW' ? n.toLocaleString('ko-KR') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseOrderDoc(p: PurchaseOrderPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e3a5f', padding: 16, marginHorizontal: -32, marginTop: -32, marginBottom: 16 }}>
          <View>
            <Text style={{ color: 'white', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>PURCHASE ORDER</Text>
            <Text style={{ color: 'white', fontSize: 9, opacity: 0.8, marginTop: 2 }}>발주서</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{p.businessId}</Text>
            {!!p.piNumber && <Text style={{ color: 'white', opacity: 0.8, fontSize: 9 }}>PI No: {p.piNumber}</Text>}
            <Text style={{ color: 'white', opacity: 0.8, fontSize: 9 }}>{p.orderDate}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={[styles.partyBox, { padding: 10 }]}>
            <Text style={{ fontSize: 7, color: '#888', letterSpacing: 1, marginBottom: 6 }}>공급업체 (SUPPLIER)</Text>
            <View style={styles.partyRowLine}><Text style={styles.partyLabel}>업체명</Text><Text style={styles.partyValue}>{p.supplierName}</Text></View>
            {!!p.incoterm && <View style={styles.partyRowLine}><Text style={styles.partyLabel}>인코텀즈</Text><Text style={styles.partyValue}>{p.incoterm}</Text></View>}
          </View>
          <View style={[styles.partyBox, { padding: 10 }]}>
            <Text style={{ fontSize: 7, color: '#888', letterSpacing: 1, marginBottom: 6 }}>발주 정보</Text>
            <View style={styles.partyRowLine}><Text style={styles.partyLabel}>발주일</Text><Text style={styles.partyValue}>{p.orderDate}</Text></View>
            {!!p.productionDueDate && <View style={styles.partyRowLine}><Text style={styles.partyLabel}>생산완료</Text><Text style={styles.partyValue}>{p.productionDueDate}</Text></View>}
            {!!p.inspectionDate && <View style={styles.partyRowLine}><Text style={styles.partyLabel}>검품일</Text><Text style={styles.partyValue}>{p.inspectionDate}</Text></View>}
            {!!p.etd && <View style={styles.partyRowLine}><Text style={styles.partyLabel}>ETD</Text><Text style={styles.partyValue}>{p.etd}</Text></View>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>품목 내역 (Item Details)</Text>
        <View style={styles.table}>
          <View style={styles.tr} fixed>
            <Text style={[styles.th, { width: 24, textAlign: 'center' }]}>No</Text>
            <Text style={[styles.th, { flex: 1 }]}>품목명 (Description)</Text>
            <Text style={[styles.th, { width: 30, textAlign: 'right' }]}>Unit</Text>
            <Text style={[styles.th, { width: 36, textAlign: 'right' }]}>Qty</Text>
            <Text style={[styles.th, { width: 66, textAlign: 'right' }]}>Unit Price</Text>
            <Text style={[styles.th, { width: 70, textAlign: 'right', borderRight: 'none' }]}>Amount</Text>
          </View>
          {p.items.map((item, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={[styles.td, { width: 24, textAlign: 'center', color: '#888' }]}>{i + 1}</Text>
              <View style={[styles.td, { flex: 1 }]}>
                <Text style={{ fontWeight: 700 }}>{item.productName}</Text>
                {!!item.specification && <Text style={{ color: '#666', fontSize: 7, marginTop: 1 }}>{item.specification}</Text>}
              </View>
              <Text style={[styles.td, { width: 30, textAlign: 'right' }]}>{item.unit || 'PCS'}</Text>
              <Text style={[styles.td, { width: 36, textAlign: 'right' }]}>{fmt(item.qty)}</Text>
              <Text style={[styles.td, { width: 66, textAlign: 'right' }]}>{fmtCur(item.unitPrice, p.currency)}</Text>
              <Text style={[styles.td, { width: 70, textAlign: 'right', fontWeight: 700, borderRight: 'none' }]}>{fmtCur(item.amount, p.currency)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.td, { width: 24 + 30 + 36, textAlign: 'right' }]}> </Text>
            <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>TOTAL</Text>
            <Text style={[styles.td, { width: 70, textAlign: 'right', fontSize: 10, borderRight: 'none' }]}>{p.currency} {fmtCur(p.total, p.currency)}</Text>
          </View>
        </View>

        <View style={{ border: '1px solid #c8d8f0', borderRadius: 4, padding: 12, backgroundColor: '#f0f6ff', marginTop: 14 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: '#1e3a5f', letterSpacing: 1, marginBottom: 6 }}>결제 조건 (PAYMENT TERMS)</Text>
          {!!p.paymentTerms && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ color: '#555' }}>결제방식</Text><Text style={{ fontWeight: 700 }}>{p.paymentTerms}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ color: '#555' }}>선금 {p.depositRatio}% (Deposit)</Text>
            <Text style={{ fontWeight: 700, color: '#1e3a5f' }}>{p.currency} {fmtCur(p.depositAmt, p.currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#555' }}>잔금 {100 - p.depositRatio}% (Balance)</Text>
            <Text style={{ fontWeight: 700, color: '#1e3a5f' }}>{p.currency} {fmtCur(p.balanceAmt, p.currency)}</Text>
          </View>
        </View>

        {!!p.remark && (
          <View style={styles.remarkBox}>
            <Text style={{ fontWeight: 700, color: '#333', marginBottom: 2 }}>비고 (Remark)</Text>
            <Text>{p.remark}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>발행: {new Date().toLocaleDateString('ko-KR')}</Text>
          <Text>이 문서는 전자 문서입니다.</Text>
        </View>
      </Page>
    </Document>
  );
}
