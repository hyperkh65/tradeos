import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface RfqItem { name: string; specification?: string; qty: number; unit?: string; remark?: string }

export interface RfqPdfProps {
  businessId: string;
  issueDate: string;
  validUntil?: string;
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

export function RfqDoc(p: RfqPdfProps) {
  const emptyRows = Math.max(0, 8 - p.items.length);

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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 8, color: '#888' }}>Valid Until</Text>
                  <Text style={{ fontSize: 9 }}>{p.validUntil}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={{ height: 2, backgroundColor: '#1a50a0', marginBottom: 18 }} />

        {/* FROM / TO */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
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

        {/* Item table */}
        <View style={{ borderTop: '2px solid #171717' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f9f9f9', borderBottom: '1px solid #171717' }}>
            <Text style={{ width: '6%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>NO</Text>
            <Text style={{ flex: 1, textAlign: 'left', padding: 7, fontSize: 8, fontWeight: 700 }}>품목 / DESCRIPTION</Text>
            <Text style={{ width: '18%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>규격 / SPEC</Text>
            <Text style={{ width: '10%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>단위</Text>
            <Text style={{ width: '10%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>수량</Text>
            <Text style={{ width: '20%', textAlign: 'left', padding: 7, fontSize: 8, fontWeight: 700 }}>비고</Text>
          </View>
          {p.items.map((it, i) => {
            const last = i === p.items.length - 1 && emptyRows === 0;
            const bStyle = last ? '1px solid #171717' : '1px solid #e5e5e5';
            return (
              <View style={{ flexDirection: 'row' }} key={i} wrap={false}>
                <Text style={{ width: '6%', textAlign: 'center', color: '#888', padding: 7, borderBottom: bStyle }}>{i + 1}</Text>
                <Text style={{ flex: 1, padding: 7, fontWeight: 600, borderBottom: bStyle }}>{it.name}</Text>
                <Text style={{ width: '18%', textAlign: 'center', fontSize: 8, color: '#555', padding: 7, borderBottom: bStyle }}>{it.specification || '-'}</Text>
                <Text style={{ width: '10%', textAlign: 'center', padding: 7, borderBottom: bStyle }}>{it.unit || 'EA'}</Text>
                <Text style={{ width: '10%', textAlign: 'center', fontWeight: 600, padding: 7, borderBottom: bStyle }}>{(it.qty || 0).toLocaleString()}</Text>
                <Text style={{ width: '20%', fontSize: 8, color: '#555', padding: 7, borderBottom: bStyle }}>{it.remark || ''}</Text>
              </View>
            );
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View style={{ flexDirection: 'row' }} key={`e${i}`}>
              <Text style={{ width: '6%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ flex: 1, height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '18%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '10%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '10%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '20%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
            </View>
          ))}
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
