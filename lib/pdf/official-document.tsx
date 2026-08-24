import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { htmlToPdf } from './html-to-pdf';

export interface OfficialDocumentPdfProps {
  businessId: string;
  title: string;
  issueDate: string;
  recipient: string;
  recipientAddress?: string;
  sender: string;
  contentHtml: string;
  contact?: string;
  company: Record<string, string>;
  companyLogoPath?: string | null;
  stampPath?: string | null;
}

export function OfficialDocumentDoc(p: OfficialDocumentPdfProps) {
  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'NotoSansKR', padding: '18mm 16mm', fontSize: 10, color: '#171717' }}>
        {/* 레터헤드 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          {p.companyLogoPath
            ? <Image src={p.companyLogoPath} style={{ height: 34, objectFit: 'contain' }} />
            : <Text style={{ fontSize: 18, fontWeight: 800 }}>{p.company.name}</Text>}
          <View style={{ alignItems: 'flex-end' }}>
            {!!p.company.address && <Text style={{ fontSize: 7.5, color: '#555' }}>{p.company.address}</Text>}
            <Text style={{ fontSize: 7.5, color: '#555' }}>
              {p.company.name} {p.company.ceo ? `${p.company.ceo} 대표` : ''}
              {p.company.tel ? `  TEL ${p.company.tel}` : ''}
              {p.company.fax ? `  FAX ${p.company.fax}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ borderBottom: '2px solid #171717', marginBottom: 14 }} />

        {/* 문서정보 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, fontSize: 9 }}>
          <Text><Text style={{ color: '#888' }}>문서번호 : </Text><Text style={{ fontWeight: 700 }}>{p.businessId}</Text></Text>
          <Text><Text style={{ color: '#888' }}>시행일자 : </Text><Text style={{ fontWeight: 700 }}>{p.issueDate}</Text></Text>
        </View>

        {/* 수신/발신/제목 */}
        <View style={{ marginBottom: 16, gap: 3 }}>
          <Text style={{ fontSize: 10 }}>수&nbsp;&nbsp;&nbsp;&nbsp;신 : {p.recipient}{p.recipientAddress ? `   ${p.recipientAddress}` : ''}</Text>
          <Text style={{ fontSize: 10 }}>발&nbsp;&nbsp;&nbsp;&nbsp;신 : {p.sender}</Text>
          <Text style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>제&nbsp;&nbsp;&nbsp;&nbsp;목 : {p.title}</Text>
        </View>
        <View style={{ borderBottom: '1px solid #ddd', marginBottom: 16 }} />

        {/* 본문 */}
        <View>{htmlToPdf(p.contentHtml)}</View>

        {/* 하단: 발신처명 + 담당자 + 도장 */}
        <View style={{ marginTop: 30, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: 700 }}>{p.sender}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10 }}>
          {!!p.contact && <Text style={{ fontSize: 9, color: '#555', marginRight: 16 }}>담당 : {p.contact}</Text>}
          {p.stampPath && <Image src={p.stampPath} style={{ width: 210, opacity: 0.9, transform: 'rotate(-5deg)' }} />}
        </View>
      </Page>
    </Document>
  );
}
