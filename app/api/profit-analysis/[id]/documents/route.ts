import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getProfitAnalysisDocuments } from '@/lib/document-aggregator';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { files, context } = getProfitAnalysisDocuments(id);
  return NextResponse.json({
    data: files.map(({ diskPath: _diskPath, generate: _generate, ...f }) => f), // 디스크 경로/생성함수는 서버 내부용, 클라이언트에 노출 안 함
    context,
  });
}
