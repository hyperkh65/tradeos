import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { countDocumentIndexByStatus, countJobsByStatus, listDocumentIndex } from '@/lib/ai/db';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';
import { qdrantGetCollectionInfo } from '@/lib/ai/vectorstore/qdrant';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const qdrantCfg = getQdrantConfig();
  let qdrant: { configured: boolean; connected: boolean; pointsCount: number; vectorSize: number | null; error?: string } = {
    configured: !!qdrantCfg, connected: false, pointsCount: 0, vectorSize: null,
  };
  if (qdrantCfg) {
    try {
      const info = await qdrantGetCollectionInfo(qdrantCfg);
      qdrant = { configured: true, connected: true, pointsCount: info.pointsCount, vectorSize: info.vectorSize };
    } catch (e) {
      qdrant = { configured: true, connected: false, pointsCount: 0, vectorSize: null, error: (e as Error).message };
    }
  }

  return NextResponse.json({
    data: {
      documentIndex: countDocumentIndexByStatus(),
      jobs: countJobsByStatus(),
      recentFailed: listDocumentIndex({ status: 'failed', limit: 20 }),
      qdrant,
    },
  });
}
