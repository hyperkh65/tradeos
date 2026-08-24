import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generatePurchaseOrderPdf } from '@/lib/pdf/generate';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const buf = await generatePurchaseOrderPdf(id);
  if (!buf) return NextResponse.json({ error: '발주서를 찾을 수 없습니다.' }, { status: 404 });

  const row = getDb().prepare('SELECT business_id FROM purchase_orders WHERE id=?').get(id) as { business_id: string };
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.business_id)}_발주서.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
