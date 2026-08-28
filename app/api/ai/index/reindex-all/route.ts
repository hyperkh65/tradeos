import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listAllSourceIds, INDEXABLE_SOURCE_TYPES } from '@/lib/ai/sources';
import { enqueueIndexJob, hasActiveJob } from '@/lib/ai/db';

/** 큐에 쌓기만 하고 실제 인덱싱은 백그라운드 워커(lib/ai/worker.ts)가 처리한다.
 * 이미 대기 중인 작업이 있으면 중복으로 다시 큐에 넣지 않는다(재시작 후에도
 * 큐에 남아있던 작업이 이어서 처리되므로 "재개 가능"함을 만족). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  let enqueued = 0;
  let skipped = 0;
  for (const sourceType of INDEXABLE_SOURCE_TYPES) {
    for (const sourceId of listAllSourceIds(sourceType)) {
      if (hasActiveJob(sourceType, sourceId)) { skipped++; continue; }
      enqueueIndexJob(sourceType, sourceId, 'update');
      enqueued++;
    }
  }
  return NextResponse.json({ data: { enqueued, skipped } });
}
