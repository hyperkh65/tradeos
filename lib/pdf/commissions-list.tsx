import { Document, Page, View, Text } from '@react-pdf/renderer';

export interface CommissionListRow {
  businessId: string; foreignCompany: string; date: string; currency: string;
  amount: number; exchangeRate: number; amountKrw: number; depositDate: string | null; status: string;
}

const cellBase = { padding: '4 6', fontSize: 8 };
const headCell = { ...cellBase, fontSize: 7.5, fontWeight: 700 as const, color: '#444' };
const tableWrap = { border: '1px solid #999', borderRadius: 2, overflow: 'hidden' as const };
const rowStyle = (last: boolean) => ({ flexDirection: 'row' as const, borderBottom: last ? undefined : '1px solid #ddd' });
const div = (last: boolean) => ({ borderRight: last ? undefined : '1px solid #ddd' });

export function CommissionsListDoc({ rows }: { rows: CommissionListRow[] }) {
  const totalKrw = rows.reduce((s, r) => s + (r.amountKrw || 0), 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={{ fontFamily: 'NotoSansKR', padding: '14mm', fontSize: 9, color: '#171717' }}>
        <Text style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>커미션 (해외 수수료) 목록</Text>
        <Text style={{ fontSize: 8, color: '#888', marginBottom: 8 }}>
          출력일: {new Date().toISOString().slice(0, 10)} · 총 {rows.length}건 · 원화환산 합계 {Math.round(totalKrw).toLocaleString()}원
        </Text>
        <View style={tableWrap}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f7f7f8', borderBottom: '1px solid #999' }}>
            <Text style={{ ...headCell, ...div(false), width: '14%' }}>번호</Text>
            <Text style={{ ...headCell, ...div(false), width: '18%' }}>해외업체명</Text>
            <Text style={{ ...headCell, ...div(false), width: '10%' }}>일자</Text>
            <Text style={{ ...headCell, ...div(false), width: '8%' }}>통화</Text>
            <Text style={{ ...headCell, ...div(false), width: '13%', textAlign: 'right' }}>금액</Text>
            <Text style={{ ...headCell, ...div(false), width: '10%', textAlign: 'right' }}>환율</Text>
            <Text style={{ ...headCell, ...div(false), width: '14%', textAlign: 'right' }}>원화환산액</Text>
            <Text style={{ ...headCell, ...div(false), width: '9%' }}>입금일</Text>
            <Text style={{ ...headCell, width: '4%' }}>상태</Text>
          </View>
          {rows.map((r, i) => (
            <View style={rowStyle(false)} key={i}>
              <Text style={{ ...cellBase, ...div(false), width: '14%' }}>{r.businessId}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '18%' }}>{r.foreignCompany}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '10%' }}>{r.date}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '8%' }}>{r.currency}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '13%', textAlign: 'right' }}>{r.amount.toLocaleString()}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '10%', textAlign: 'right' }}>{r.exchangeRate ? r.exchangeRate.toLocaleString() : '-'}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '14%', textAlign: 'right' }}>{r.amountKrw ? Math.round(r.amountKrw).toLocaleString() : '-'}</Text>
              <Text style={{ ...cellBase, ...div(false), width: '9%' }}>{r.depositDate || '-'}</Text>
              <Text style={{ ...cellBase, width: '4%' }}>{r.status === 'closed' ? '마감' : '진행'}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
