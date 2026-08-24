import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles, fmt } from './styles';

export interface ProfitAnalysisPdfProps {
  businessId: string;
  title: string;
  analysisDate: string;
  customerName?: string;
  supplierName?: string;
  importBusinessId?: string;
  saleAmount: number;
  costRows: { label: string; tag: string; val: number }[];
  totalCost: number;
  profit: number;
  profitRate: number;
  vatImport: number;
}

export function ProfitAnalysisDoc(p: ProfitAnalysisPdfProps) {
  const positive = p.profit >= 0;
  const tagList = p.costRows.map(r => r.tag).join('+');
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>수 익 분 석 표</Text>
          <Text style={styles.subtitle}>PROFIT ANALYSIS REPORT</Text>
        </View>

        <View style={styles.docInfoRow}>
          <View style={styles.docInfoGroup}>
            <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>문서번호</Text><Text style={styles.docInfoValue}>{p.businessId}</Text></View>
            <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>분석일자</Text><Text style={styles.docInfoValue}>{p.analysisDate}</Text></View>
            {!!p.importBusinessId && <View style={styles.docInfoItem}><Text style={styles.docInfoLabel}>통관건</Text><Text style={styles.docInfoValue}>{p.importBusinessId}</Text></View>}
          </View>
        </View>

        <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{p.title}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
          {!!p.customerName && <Text style={{ fontSize: 8, color: '#666' }}>고객사: {p.customerName}</Text>}
          {!!p.supplierName && <Text style={{ fontSize: 8, color: '#666' }}>공급업체: {p.supplierName}</Text>}
        </View>

        <View style={{ border: '2px solid ' + (positive ? '#93c5fd' : '#fca5a5'), borderRadius: 6, padding: 14, backgroundColor: positive ? '#eff6ff' : '#fef2f2' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#666', letterSpacing: 1 }}>수익분석 레포트</Text>
            <Text style={{ fontSize: 7, color: '#999' }}>수익 = [A] - ({tagList})</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottom: '1px solid #e5e7eb' }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Text style={{ fontSize: 7, backgroundColor: '#dbeafe', color: '#1d4ed8', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 }}>A</Text>
              <Text style={{ fontWeight: 700 }}>매출금액</Text>
            </View>
            <Text style={{ fontWeight: 700 }}>{fmt(p.saleAmount)}원</Text>
          </View>

          <View style={{ paddingVertical: 6 }}>
            <Text style={{ fontSize: 8, color: '#666', marginBottom: 4 }}>B. 비용 합계</Text>
            {p.costRows.map(r => (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }} key={r.tag}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Text style={{ fontSize: 7, backgroundColor: '#f3f4f6', color: '#4b5563', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 }}>{r.tag}</Text>
                  <Text style={{ color: '#666' }}>{r.label}</Text>
                </View>
                <Text>- {fmt(r.val)}원</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: 4, marginTop: 2 }}>
              <Text style={{ fontWeight: 700 }}>비용 합계</Text>
              <Text style={{ fontWeight: 700 }}>- {fmt(p.totalCost)}원</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: positive ? '#dbeafe' : '#fee2e2', borderRadius: 4, padding: 10, marginTop: 6 }}>
            <View>
              <Text style={{ fontSize: 7, color: '#666' }}>수익 [A] - [B]</Text>
              <Text style={{ fontSize: 7, color: '#666', marginTop: 1 }}>{fmt(p.saleAmount)} - {fmt(p.totalCost)}</Text>
              <Text style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: positive ? '#1d4ed8' : '#dc2626' }}>{positive ? '+' : ''}{fmt(p.profit)}원</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 7, color: '#666' }}>수익률</Text>
              <Text style={{ fontSize: 18, fontWeight: 700, color: positive ? '#1d4ed8' : '#dc2626' }}>{p.profitRate.toFixed(1)}%</Text>
            </View>
          </View>

          {p.vatImport > 0 && (
            <Text style={{ fontSize: 7, color: '#666', backgroundColor: '#f9fafb', padding: 6, borderRadius: 3, marginTop: 8, border: '1px solid #e5e7eb' }}>
              * 참고: 수입부가세 {fmt(p.vatImport)}원 (매입세액공제 환급대상 — 위 비용에 미포함)
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text>발행: {new Date().toLocaleDateString('ko-KR')}</Text>
          <Text>이 문서는 전자 문서입니다.</Text>
        </View>
      </Page>
    </Document>
  );
}
