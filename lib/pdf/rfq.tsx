import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface RfqItem {
  name: string; specification?: string; qty: number; unit?: string; remark?: string;
  unitPrice?: number; imagePath?: string | null;
}

export interface RfqPdfProps {
  businessId: string;
  issueDate: string;
  validUntil?: string;
  currency?: string;
  paymentTerms?: string;
  supplierName: string;
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  items: RfqItem[];
  remark?: string;
  company: Record<string, string>;
  companyLogoPath?: string | null;
}

const fmtPrice = (n: number | undefined, currency: string) =>
  n ? n.toLocaleString(currency === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: currency === 'KRW' ? 0 : 2, maximumFractionDigits: currency === 'KRW' ? 0 : 2 }) : '-';

export function RfqDoc(p: RfqPdfProps) {
  const emptyRows = Math.max(0, 6 - p.items.length);
  const currency = p.currency || 'USD';
  const totalAmount = p.items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '10mm', fontSize: 9, color: '#171717' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <View style={{ width: '55%' }}>
            {p.companyLogoPath
              ? <Image src={p.companyLogoPath} style={{ height: 28, objectFit: 'contain', marginBottom: 6 }} />
              : <Text style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{p.company.name}</Text>}
            {!!p.company.address && <Text style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>{p.company.address}</Text>}
            {(p.company.tel || p.company.fax) && <Text style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>Tel: {p.company.tel}{p.company.fax ? ` | Fax: ${p.company.fax}` : ''}</Text>}
            {!!p.company.email && <Text style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>Email: {p.company.email}</Text>}
            {!!p.company.bizNo && <Text style={{ fontSize: 8, color: '#555' }}>사업자번호: {p.company.bizNo}</Text>}
          </View>
          <View style={{ width: '40%', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1, color: '#1a50a0' }}>견적 의뢰서</Text>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 10 }}>REQUEST FOR QUOTATION</Text>
            <View style={{ width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 8, color: '#888' }}>Quote No.</Text>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>{p.businessId}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 8, color: '#888' }}>Date</Text>
                <Text style={{ fontSize: 9 }}>{p.issueDate}</Text>
              </View>
              {!!p.validUntil && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 8, color: '#888' }}>Valid Until</Text>
                  <Text style={{ fontSize: 9 }}>{p.validUntil}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 8, color: '#888' }}>Currency</Text>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>{currency}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={{ height: 2, backgroundColor: '#1a50a0', marginBottom: 18 }} />

        {/* FROM / TO */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: '#f0f6ff', borderRadius: 6, padding: 12 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#1a50a0', letterSpacing: 1, marginBottom: 6 }}>FROM (구매자)</Text>
            <Text style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{p.company.name}</Text>
            {!!p.company.address && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>{p.company.address}</Text>}
            {(p.company.tel || p.company.fax) && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Tel: {p.company.tel}{p.company.fax ? ` | Fax: ${p.company.fax}` : ''}</Text>}
            {!!p.company.email && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Email: {p.company.email}</Text>}
            {!!p.company.bizNo && <Text style={{ fontSize: 8, color: '#333' }}>사업자번호: {p.company.bizNo}</Text>}
          </View>
          <View style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: 12 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 6 }}>TO (공급사)</Text>
            <Text style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{p.supplierName || '-'}</Text>
            {!!p.supplierContact && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>담당자: {p.supplierContact}</Text>}
            {!!p.supplierPhone && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Tel: {p.supplierPhone}</Text>}
            {!!p.supplierEmail && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Email: {p.supplierEmail}</Text>}
            {!!p.supplierAddress && <Text style={{ fontSize: 8, color: '#333' }}>{p.supplierAddress}</Text>}
          </View>
        </View>

        {!!p.paymentTerms && (
          <View style={{ backgroundColor: '#fafafa', borderRadius: 6, padding: '8px 12px', marginBottom: 16, flexDirection: 'row' }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#888', marginRight: 8 }}>지급조건 / PAYMENT TERMS</Text>
            <Text style={{ fontSize: 9, color: '#333' }}>{p.paymentTerms}</Text>
          </View>
        )}

        {/* Item table */}
        <View style={{ borderTop: '2px solid #171717' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f9f9f9', borderBottom: '1px solid #171717' }}>
            <Text style={{ width: '5%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>NO</Text>
            <Text style={{ width: '11%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>사진</Text>
            <Text style={{ flex: 1, textAlign: 'left', padding: 6, fontSize: 7, fontWeight: 700 }}>품목 / 규격</Text>
            <Text style={{ width: '8%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>단위</Text>
            <Text style={{ width: '9%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>수량</Text>
            <Text style={{ width: '13%', textAlign: 'right', padding: 6, fontSize: 7, fontWeight: 700 }}>희망단가</Text>
            <Text style={{ width: '13%', textAlign: 'right', padding: 6, fontSize: 7, fontWeight: 700 }}>금액</Text>
            <Text style={{ width: '16%', textAlign: 'left', padding: 6, fontSize: 7, fontWeight: 700 }}>비고</Text>
          </View>
          {p.items.map((it, i) => {
            const last = i === p.items.length - 1 && emptyRows === 0;
            const bStyle = last ? '1px solid #171717' : '1px solid #e5e5e5';
            const amount = (it.qty || 0) * (it.unitPrice || 0);
            return (
              <View style={{ flexDirection: 'row', minHeight: 40 }} key={i} wrap={false}>
                <Text style={{ width: '5%', textAlign: 'center', color: '#888', padding: 6, borderBottom: bStyle }}>{i + 1}</Text>
                <View style={{ width: '11%', padding: 4, borderBottom: bStyle, alignItems: 'center', justifyContent: 'center' }}>
                  {it.imagePath
                    ? <Image src={it.imagePath} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 3 }} />
                    : <Text style={{ fontSize: 6, color: '#ccc' }}>-</Text>}
                </View>
                <View style={{ flex: 1, padding: 6, borderBottom: bStyle }}>
                  <Text style={{ fontWeight: 600 }}>{it.name}</Text>
                  {!!it.specification && <Text style={{ fontSize: 7, color: '#888', marginTop: 1 }}>{it.specification}</Text>}
                </View>
                <Text style={{ width: '8%', textAlign: 'center', padding: 6, borderBottom: bStyle }}>{it.unit || 'EA'}</Text>
                <Text style={{ width: '9%', textAlign: 'center', fontWeight: 600, padding: 6, borderBottom: bStyle }}>{(it.qty || 0).toLocaleString()}</Text>
                <Text style={{ width: '13%', textAlign: 'right', padding: 6, borderBottom: bStyle }}>{fmtPrice(it.unitPrice, currency)}</Text>
                <Text style={{ width: '13%', textAlign: 'right', fontWeight: 700, padding: 6, borderBottom: bStyle }}>{amount ? fmtPrice(amount, currency) : '-'}</Text>
                <Text style={{ width: '16%', fontSize: 7, color: '#555', padding: 6, borderBottom: bStyle }}>{it.remark || ''}</Text>
              </View>
            );
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View style={{ flexDirection: 'row' }} key={`e${i}`}>
              <Text style={{ width: '5%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '11%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ flex: 1, height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '8%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '9%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '13%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '13%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '16%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
            </View>
          ))}
          {totalAmount > 0 && (
            <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
              <Text style={{ width: '46%', textAlign: 'right', padding: 6, fontSize: 8, fontWeight: 700, color: '#666' }}>합계 ({currency})</Text>
              <Text style={{ width: '13%' }} />
              <Text style={{ width: '13%', textAlign: 'right', padding: 6, fontSize: 9, fontWeight: 900 }}>{fmtPrice(totalAmount, currency)}</Text>
              <Text style={{ width: '16%' }} />
            </View>
          )}
        </View>

        {/* Remark */}
        {!!p.remark && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 6, color: '#888' }}>요청사항 / NOTE</Text>
            <View style={{ borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
              <Text style={{ fontSize: 9, color: '#333', lineHeight: 1.5 }}>{p.remark}</Text>
            </View>
          </View>
        )}

        <Text style={{ marginTop: 24, fontSize: 8, color: '#aaa', textAlign: 'center' }}>
          상기 품목에 대한 견적을 요청드립니다. 회신은 위 연락처로 부탁드립니다.
        </Text>
      </Page>
    </Document>
  );
}
