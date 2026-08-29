import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listVectorCollections, countJobsByStatus, countDocumentIndexByStatus } from '@/lib/ai/db';

/** 진행 중이거나 가장 최근에 끝난(성공/실패) 재인덱싱 마이그레이션의 진행률을 보여준다.
 * active 컬렉션 자체의 상태는 /api/ai/index/status에서 이미 보여주므로, 여기서는
 * "지금 이 순간 재인덱싱이 어디까지 왔는지"만 다룬다. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const collections = listVectorCollections();
  const target = collections.find(c => c.status === 'building') || collections.find(c => c.status === 'failed') || null;

  if (!target) {
    return NextResponse.json({ data: { inProgress: false, collections } });
  }

  const jobCounts = countJobsByStatus(target.id);
  const docCounts = countDocumentIndexByStatus(target.id);
  const total = Object.values(jobCounts).reduce((s, n) => s + n, 0);
  const done = (jobCounts.completed || 0);
  const failed = (jobCounts.failed || 0);
  const remaining = (jobCounts.pending || 0) + (jobCounts.processing || 0) + (jobCounts.retrying || 0);

  return NextResponse.json({
    data: {
      inProgress: target.status === 'building',
      collection: target,
      total, done, failed, remaining,
      percent: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
      documentIndex: docCounts,
      collections,
    },
  });
}
