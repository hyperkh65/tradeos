import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles, fmt, PartyBox } from './styles';

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
}

export function SalesStatementDoc(p: SalesStatementProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>거 래 명 세 표</Text>
          <Text style={styles.subtitle}>TRANSACTION STATEMENT</Text>
        </View>

        <View style={styles.docInfoRow}>
          <View style={styles.docInfoGroup}>
            <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>문서번호</Text><Text style={styles.docInfoValue}>{p.businessId}</Text></View>
            <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>거래일자</Text><Text style={styles.docInfoValue}>{p.saleDate}</Text></View>
            <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>거래유형</Text><Text style={styles.docInfoValue}>{p.saleType}</Text></View>
          </View>
          {!!p.poNo && <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>PO#</Text><Text style={styles.docInfoValue}>{p.poNo}</Text></View>}
        </View>

        <View style={styles.partyRow}>
          <PartyBox label="공 급 자" name={p.company.name} rows={[
            ['사업자번호', p.company.bizNo], ['대표자', p.company.ceo], ['주소', p.company.address], ['전화', p.company.tel],
          ]} />
          <PartyBox label="공 급 받 는 자" name={p.customer} rows={[
            ['사업자번호', p.customerCo?.business_no], ['대표자', p.customerCo?.ceo],
            ['주소', p.customerCo?.address], ['전화', p.customerCo?.phone],
            ['담당자', p.salesperson],
          ]} />
        </View>

        <View style={styles.table}>
          <View style={styles.tr} fixed>
            <Text style={[styles.th, { width: 24, textAlign: 'center' }]}>No</Text>
            <Text style={[styles.th, { flex: 1 }]}>품목 및 규격</Text>
            <Text style={[styles.th, { width: 40, textAlign: 'right' }]}>수량</Text>
            <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>단가</Text>
            <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>공급가액</Text>
            <Text style={[styles.th, { width: 60, borderRight: 'none' }]}>비고</Text>
          </View>
          {p.items.map((item, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={[styles.td, { width: 24, textAlign: 'center', color: '#888' }]}>{i + 1}</Text>
              <View style={[styles.td, { flex: 1 }]}>
                <Text style={{ fontWeight: 700 }}>{item.product}</Text>
                {!!item.specification && <Text style={{ color: '#666', fontSize: 7, marginTop: 1 }}>{item.specification}</Text>}
              </View>
              <Text style={[styles.td, { width: 40, textAlign: 'right' }]}>{fmt(item.qty)}</Text>
              <Text style={[styles.td, { width: 60, textAlign: 'right' }]}>{fmt(item.unitPrice)}</Text>
              <Text style={[styles.td, { width: 70, textAlign: 'right', fontWeight: 700 }]}>{fmt(item.amount)}</Text>
              <Text style={[styles.td, { width: 60, borderRight: 'none', fontSize: 7, color: '#555' }]}>{item.remark || ''}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.td, { width: 24 + 60 + 40, textAlign: 'right' }]}> </Text>
            <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>합 계</Text>
            <Text style={[styles.td, { width: 70, textAlign: 'right' }]}>{fmt(p.netAmount)}</Text>
            <Text style={[styles.td, { width: 60, borderRight: 'none' }]} />
          </View>
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsLine}><Text style={{ color: '#666' }}>공급가액</Text><Text style={{ fontWeight: 700 }}>{fmt(p.netAmount)}원</Text></View>
          <View style={styles.totalsLine}><Text style={{ color: '#666' }}>부가세 (10%)</Text><Text style={{ fontWeight: 700 }}>{fmt(p.vat)}원</Text></View>
          <View style={styles.grandTotalLine}><Text>합계금액</Text><Text>{fmt(p.total)}원</Text></View>
        </View>

        {!!p.misc && (
          <View style={styles.remarkBox}>
            <Text style={{ color: '#888', fontSize: 7, marginBottom: 3 }}>기타 사항</Text>
            <Text>{p.misc}</Text>
          </View>
        )}

        {!!p.company.bank && (
          <View style={[styles.remarkBox, { marginTop: 14 }]}>
            <Text style={{ color: '#888', fontSize: 7, marginBottom: 3 }}>입금 계좌</Text>
            <Text>{p.company.bank}</Text>
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
