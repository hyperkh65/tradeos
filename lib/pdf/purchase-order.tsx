import { Document, Page, View, Text, Image } from '@react-pdf/renderer';

export interface POItem {
  productName: string; specification?: string; unit?: string; qty: number; quantity?: number; unitPrice: number; amount: number;
  voltage?: string; watts?: string; cct?: string; luminousEff?: string; lumenOutput?: string;
}

export interface SupplierCo { ceo?: string; address?: string; phone?: string; email?: string; wechat?: string }

export interface PurchaseOrderPdfProps {
  businessId: string;
  orderDate: string;
  etd?: string;
  supplierName: string;
  supplierCo?: SupplierCo;
  currency: string;
  items: POItem[];
  totalAmount: number;
  depositRatio: number;
  depositAmount: number;
  balanceAmount: number;
  paymentTerms?: string;
  incoterm?: string;
  remark?: string;
  company: Record<string, string>;
  companyLogoPath?: string | null;
  stampPath?: string | null;
}

const CURRENCY_CODES_RE = /\s*\|\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i;
function cleanSpec(s: string) {
  return s.replace(CURRENCY_CODES_RE, '').replace(/^\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i, '').trim();
}
function fmtNum(n: number, currency: string) {
  return currency === 'KRW' ? n.toLocaleString('ko-KR') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseOrderDoc(p: PurchaseOrderPdfProps) {
  const emptyRows = Math.max(0, 8 - p.items.length);

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '10mm', fontSize: 9, color: '#171717' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <View style={{ width: '30%' }}>
            {p.companyLogoPath
              ? <Image src={p.companyLogoPath} style={{ height: 32, objectFit: 'contain' }} />
              : <Text style={{ fontSize: 14, fontWeight: 800 }}>{p.company.name}</Text>}
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 19, fontWeight: 900, letterSpacing: 1.5, textAlign: 'center' }}>PURCHASE ORDER</Text>
            <View style={{ width: 32, height: 3, backgroundColor: '#171717', marginTop: 10 }} />
          </View>
          <View style={{ width: '30%', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 3 }}>P.O NUMBER</Text>
            <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{p.businessId}</Text>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 3 }}>ISSUE DATE</Text>
            <Text style={{ fontSize: 11, fontWeight: 500, color: '#333' }}>{p.orderDate}</Text>
            {!!p.etd && (
              <>
                <Text style={{ fontSize: 8, color: '#888', marginBottom: 3, marginTop: 6 }}>ETD</Text>
                <Text style={{ fontSize: 10, fontWeight: 500, color: '#333' }}>{p.etd}</Text>
              </>
            )}
          </View>
        </View>

        {/* Supplier / Ship To */}
        <View style={{ flexDirection: 'row', gap: 24, marginBottom: 26, marginTop: 14 }}>
          <View style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: 14, position: 'relative' }}>
            <Text style={{ position: 'absolute', top: -8, left: 12, backgroundColor: 'white', paddingHorizontal: 6, fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 1 }}>SUPPLIER (VENDOR)</Text>
            <Text style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{p.supplierName}</Text>
            {!!p.supplierCo?.ceo && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>Attn: {p.supplierCo.ceo}</Text>}
            {!!p.supplierCo?.address && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>{p.supplierCo.address}</Text>}
            {!!p.supplierCo?.phone && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>Tel: {p.supplierCo.phone}</Text>}
            {!!p.supplierCo?.email && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>Email: {p.supplierCo.email}</Text>}
            {!!p.supplierCo?.wechat && <Text style={{ fontSize: 9, color: '#333' }}>WeChat: {p.supplierCo.wechat}</Text>}
          </View>
          <View style={{ flex: 1, backgroundColor: '#fafafa', borderRadius: 6, padding: 14, position: 'relative' }}>
            <Text style={{ position: 'absolute', top: -8, left: 12, backgroundColor: '#fafafa', paddingHorizontal: 6, fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 1 }}>SHIP TO (BUYER)</Text>
            <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{p.company.name}</Text>
            {!!p.company.address && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>{p.company.address}</Text>}
            {(p.company.tel || p.company.fax) && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>Tel: {p.company.tel}{p.company.fax ? ` / Fax: ${p.company.fax}` : ''}</Text>}
            {!!p.company.email && <Text style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>Email: {p.company.email}</Text>}
            <Text style={{ fontSize: 9, color: '#333' }}>Attn: Purchase Department</Text>
          </View>
        </View>

        {/* Item table */}
        <View style={{ borderTop: '2px solid #171717' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f9f9f9', borderBottom: '1px solid #171717' }}>
            <Text style={{ width: '5%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>NO</Text>
            <Text style={{ flex: 1, textAlign: 'left', paddingLeft: 8, padding: 7, fontSize: 8, fontWeight: 700 }}>DESCRIPTION / SPECIFICATIONS</Text>
            <Text style={{ width: '14%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>TECH DATA</Text>
            <Text style={{ width: '7%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>UNIT</Text>
            <Text style={{ width: '8%', textAlign: 'center', padding: 7, fontSize: 8, fontWeight: 700 }}>QTY</Text>
            <Text style={{ width: '13%', textAlign: 'right', paddingRight: 6, padding: 7, fontSize: 8, fontWeight: 700 }}>UNIT PRICE ({p.currency})</Text>
            <Text style={{ width: '14%', textAlign: 'right', paddingRight: 6, padding: 7, fontSize: 8, fontWeight: 700 }}>AMOUNT ({p.currency})</Text>
          </View>
          {p.items.map((it, i) => {
            const tech = [it.voltage, it.watts, it.cct, it.luminousEff, it.lumenOutput].filter(Boolean).join(' / ');
            const spec = it.specification ? cleanSpec(it.specification) : '';
            const qty = it.qty || it.quantity || 0;
            const rowAmt = it.amount || (it.unitPrice * qty) || 0;
            const last = i === p.items.length - 1 && emptyRows === 0;
            const bStyle = last ? '1px solid #171717' : '1px solid #e5e5e5';
            return (
              <View style={{ flexDirection: 'row' }} key={i} wrap={false}>
                <Text style={{ width: '5%', textAlign: 'center', color: '#888', padding: 7, borderBottom: bStyle }}>{i + 1}</Text>
                <View style={{ flex: 1, paddingLeft: 8, padding: 7, borderBottom: bStyle }}>
                  <Text style={{ fontWeight: 600 }}>{it.productName}</Text>
                  {!!spec && <Text style={{ fontSize: 7, color: '#888', marginTop: 1 }}>{spec}</Text>}
                </View>
                <Text style={{ width: '14%', textAlign: 'center', fontSize: 7, color: '#666', padding: 7, borderBottom: bStyle }}>{tech || '—'}</Text>
                <Text style={{ width: '7%', textAlign: 'center', padding: 7, borderBottom: bStyle }}>{it.unit || 'PCS'}</Text>
                <Text style={{ width: '8%', textAlign: 'center', fontWeight: 600, padding: 7, borderBottom: bStyle }}>{qty.toLocaleString()}</Text>
                <Text style={{ width: '13%', textAlign: 'right', paddingRight: 6, padding: 7, borderBottom: bStyle }}>{fmtNum(it.unitPrice || 0, p.currency)}</Text>
                <Text style={{ width: '14%', textAlign: 'right', fontWeight: 700, paddingRight: 6, padding: 7, borderBottom: bStyle }}>{fmtNum(rowAmt, p.currency)}</Text>
              </View>
            );
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View style={{ flexDirection: 'row' }} key={`e${i}`}>
              <Text style={{ width: '5%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ flex: 1, height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '14%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '7%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '8%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '13%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
              <Text style={{ width: '14%', height: 22, borderBottom: i === emptyRows - 1 ? '1px solid #171717' : '1px solid #e5e5e5' }} />
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, gap: 30, alignItems: 'flex-start' }}>
          {p.depositAmount > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>Sub Total: <Text style={{ fontWeight: 700 }}>{p.currency} {fmtNum(p.totalAmount, p.currency)}</Text></Text>
              <Text style={{ fontSize: 9, color: '#c05000', marginBottom: 4 }}>Deposit {p.depositRatio}% (선금): <Text style={{ fontWeight: 700 }}>{p.currency} {fmtNum(p.depositAmount, p.currency)}</Text></Text>
              <Text style={{ fontSize: 9, color: '#1a50a0' }}>Balance {100 - p.depositRatio}% (잔금): <Text style={{ fontWeight: 700 }}>{p.currency} {fmtNum(p.balanceAmount, p.currency)}</Text></Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: '#666' }}>GRAND TOTAL ({p.currency})</Text>
            <Text style={{ fontSize: 20, fontWeight: 900 }}>{fmtNum(p.totalAmount, p.currency)}</Text>
          </View>
        </View>

        {/* Terms + Signature */}
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>TERMS & CONDITIONS</Text>
            <View style={{ borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
              {!!p.paymentTerms && <Text style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>Payment: {p.paymentTerms}</Text>}
              {!!p.incoterm && <Text style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>Incoterm: {p.incoterm}</Text>}
              <Text style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>Order Date: {p.orderDate}</Text>
              {!!p.etd && <Text style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>ETD: {p.etd}</Text>}
              {!!p.remark && <Text style={{ fontSize: 9, color: '#555' }}>{p.remark}</Text>}
            </View>
            {!!(p.company.bankForeign1 || p.company.bank) && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>REMITTANCE INFORMATION</Text>
                <View style={{ borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
                  <Text style={{ fontSize: 9, color: '#555' }}>{p.company.bankForeign1 || p.company.bank}</Text>
                </View>
              </View>
            )}
          </View>
          <View style={{ width: 190 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>AUTHORIZED SIGNATURE</Text>
            <View style={{ height: 90, borderBottom: '2px solid #171717', alignItems: 'center', justifyContent: 'center' }}>
              {p.stampPath ? (
                <Image src={p.stampPath} style={{ width: 150, opacity: 0.85, transform: 'rotate(-5deg)' }} />
              ) : (
                <View style={{ width: 90, height: 90, border: '1px dashed #ccc', borderRadius: 45, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8, color: '#bbb' }}>직인</Text>
                </View>
              )}
            </View>
            <Text style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, marginTop: 6 }}>{p.company.name}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
