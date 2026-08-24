import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateTradeStatementCustomPdf } from '@/lib/pdf/generate';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const buf = await generateTradeStatementCustomPdf(id);
  if (!buf) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });

  const row = getDb().prepare('SELECT business_id FROM sales WHERE id=?').get(id) as { business_id: string } | undefined;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(`${row?.business_id || id}_거래명세표(고객양식).pdf`)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
