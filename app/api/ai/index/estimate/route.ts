import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { countAllSources, INDEXABLE_SOURCE_TYPES } from '@/lib/ai/sources';
import { countDocumentIndexByStatus, countJobsByStatus } from '@/lib/ai/db';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';

/** "전체 재인덱싱" 버튼을 누르기 전에 몇 건이 처리될지 미리 보여준다. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const totals = countAllSources();
  const totalCount = INDEXABLE_SOURCE_TYPES.reduce((sum, t) => sum + totals[t], 0);
  return NextResponse.json({
    data: {
      bySourceType: totals,
      totalCount,
      documentIndex: countDocumentIndexByStatus(),
      jobs: countJobsByStatus(),
      qdrantConfigured: !!getQdrantConfig(),
    },
  });
}
