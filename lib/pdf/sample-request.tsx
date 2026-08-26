import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface SampleItem {
  name: string; specification?: string; qty: number; unit?: string; remark?: string;
  chargeType?: 'free' | 'paid'; amount?: number; imagePath?: string | null;
}

export interface SampleRequestPdfProps {
  businessId: string;
  issueDate: string;
  validUntil?: string;
  currency?: string;
  supplierName: string;
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  items: SampleItem[];
  remark?: string;
  company: Record<string, string>;
  companyLogoPath?: string | null;
}

const fmtPrice = (n: number | undefined, currency: string) =>
  n ? n.toLocaleString(currency === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: currency === 'KRW' ? 0 : 2, maximumFractionDigits: currency === 'KRW' ? 0 : 2 }) : '-';

export function SampleRequestDoc(p: SampleRequestPdfProps) {
  const emptyRows = Math.max(0, 6 - p.items.length);
  const currency = p.currency || 'USD';
  const totalAmount = p.items.reduce((s, it) => s + (it.chargeType === 'paid' ? (it.amount || 0) : 0), 0);

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
            {!!p.company.bizNo && <Text style={{ fontSize: 8, color: '#555' }}>사업자번호 Biz No: {p.company.bizNo}</Text>}
          </View>
          <View style={{ width: '40%', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1, color: '#0f8a5f' }}>샘플 의뢰서</Text>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 10 }}>SAMPLE REQUEST FORM</Text>
            <View style={{ width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 8, color: '#888' }}>문서번호 No.</Text>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>{p.businessId}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 8, color: '#888' }}>작성일 Date</Text>
                <Text style={{ fontSize: 9 }}>{p.issueDate}</Text>
              </View>
              {!!p.validUntil && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 8, color: '#888' }}>유효기한 Valid Until</Text>
                  <Text style={{ fontSize: 9 }}>{p.validUntil}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 8, color: '#888' }}>통화 Currency</Text>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>{currency}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={{ height: 2, backgroundColor: '#0f8a5f', marginBottom: 18 }} />

        {/* FROM / TO */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
          <View style={{ flex: 1, backgroundColor: '#f0faf5', borderRadius: 6, padding: 12 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#0f8a5f', letterSpacing: 1, marginBottom: 6 }}>구매자 FROM (BUYER)</Text>
            <Text style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{p.company.name}</Text>
            {!!p.company.address && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>{p.company.address}</Text>}
            {(p.company.tel || p.company.fax) && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Tel: {p.company.tel}{p.company.fax ? ` | Fax: ${p.company.fax}` : ''}</Text>}
            {!!p.company.email && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Email: {p.company.email}</Text>}
            {!!p.company.bizNo && <Text style={{ fontSize: 8, color: '#333' }}>사업자번호 Biz No: {p.company.bizNo}</Text>}
          </View>
          <View style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: 12 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 6 }}>공급사 TO (SUPPLIER)</Text>
            <Text style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{p.supplierName || '-'}</Text>
            {!!p.supplierContact && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>담당자 Attn: {p.supplierContact}</Text>}
            {!!p.supplierPhone && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Tel: {p.supplierPhone}</Text>}
            {!!p.supplierEmail && <Text style={{ fontSize: 8, color: '#333', marginBottom: 2 }}>Email: {p.supplierEmail}</Text>}
            {!!p.supplierAddress && <Text style={{ fontSize: 8, color: '#333' }}>{p.supplierAddress}</Text>}
          </View>
        </View>

        {/* Item table */}
        <View style={{ borderTop: '2px solid #171717' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f9f9f9', borderBottom: '1px solid #171717' }}>
            <Text style={{ width: '5%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>NO</Text>
            <Text style={{ width: '11%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>사진 PHOTO</Text>
            <Text style={{ flex: 1, textAlign: 'left', padding: 6, fontSize: 7, fontWeight: 700 }}>품목/규격 ITEM/SPEC</Text>
            <Text style={{ width: '8%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>단위 UNIT</Text>
            <Text style={{ width: '8%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>수량 QTY</Text>
            <Text style={{ width: '10%', textAlign: 'center', padding: 6, fontSize: 7, fontWeight: 700 }}>구분 TYPE</Text>
            <Text style={{ width: '13%', textAlign: 'right', padding: 6, fontSize: 7, fontWeight: 700 }}>금액 AMOUNT</Text>
            <Text style={{ width: '15%', textAlign: 'left', padding: 6, fontSize: 7, fontWeight: 700 }}>비고 REMARK</Text>
          </View>
          {p.items.map((it, i) => {
            const last = i === p.items.length - 1 && emptyRows === 0;
            const bStyle = last ? '1px solid #171717' : '1px solid #e5e5e5';
            const isPaid = it.chargeType === 'paid';
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
                <Text style={{ width: '8%', textAlign: 'center', fontWeight: 600, padding: 6, borderBottom: bStyle }}>{(it.qty || 0).toLocaleString()}</Text>
                <View style={{ width: '10%', padding: 6, borderBottom: bStyle, alignItems: 'center' }}>
                  <Text style={{
                    fontSize: 7, fontWeight: 700, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8,
                    color: isPaid ? '#a83232' : '#0f8a5f', backgroundColor: isPaid ? '#fdecec' : '#eafaf1',
                  }}>
                    {isPaid ? '유상 PAID' : '무상 FREE'}
                  </Text>
                </View>
                <Text style={{ width: '13%', textAlign: 'right', padding: 6, borderBottom: bStyle }}>{isPaid ? fmtPrice(it.amount, currency) : '-'}</Text>
                <Text style={{ width: '15%', fontSize: 7, color: '#555', padding: 6, borderBottom: bStyle }}>{it.remark || ''}</Text>
              </View>
            );
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View style={{ flexDirection: 'row' }} key={`e${i}`}>
              <Text style={{ width: '5%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '11%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ flex: 1, height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '8%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '8%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '10%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '13%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '15%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
            </View>
          ))}
          {totalAmount > 0 && (
            <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
              <Text style={{ width: '43%', textAlign: 'right', padding: 6, fontSize: 8, fontWeight: 700, color: '#666' }}>유상품목 합계 PAID TOTAL ({currency})</Text>
              <Text style={{ width: '10%' }} />
              <Text style={{ width: '13%', textAlign: 'right', padding: 6, fontSize: 9, fontWeight: 900 }}>{fmtPrice(totalAmount, currency)}</Text>
              <Text style={{ width: '15%' }} />
            </View>
          )}
        </View>

        {/* Remark */}
        {!!p.remark && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 6, color: '#888' }}>요청사항 NOTE</Text>
            <View style={{ borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
              <Text style={{ fontSize: 9, color: '#333', lineHeight: 1.5 }}>{p.remark}</Text>
            </View>
          </View>
        )}

        <Text style={{ marginTop: 24, fontSize: 8, color: '#aaa', textAlign: 'center' }}>
          상기 품목의 샘플을 요청드립니다. 회신은 위 연락처로 부탁드립니다. / We kindly request samples of the above items. Please reply to the contact above.
        </Text>
      </Page>
    </Document>
  );
}
