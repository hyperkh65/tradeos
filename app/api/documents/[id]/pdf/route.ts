import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateOfficialDocumentPdf, generateImportCostSettlementPdf, generateRfqPdf } from '@/lib/pdf/generate';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const row = getDb().prepare('SELECT doc_type, business_id, title FROM documents WHERE id=?').get(id) as
    { doc_type: string; business_id: string; title: string } | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  const buf = row.doc_type === 'official'
    ? await generateOfficialDocumentPdf(id)
    : row.doc_type === 'import_cost_settlement'
      ? await generateImportCostSettlementPdf(id)
      : row.doc_type === 'rfq'
        ? await generateRfqPdf(id)
        : null;

  if (!buf) return NextResponse.json({ error: '지원하지 않는 문서 종류입니다' }, { status: 400 });

  const filename = `${row.business_id}_${row.title}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
