import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listVectorCollections, setVectorCollectionStatus, deleteJobsForCollection } from '@/lib/ai/db';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';
import { qdrantDeleteCollection } from '@/lib/ai/vectorstore/qdrant';

/** 진행 중인 재인덱싱(building 컬렉션)을 포기한다 — 잘못된 임베딩 모델로 시작됐거나,
 * 작업이 멈춰서(예: 배포로 워커가 재시작되며 잡이 processing에 고아로 남는 경우)
 * 더 이상 진행되지 않을 때 관리자가 정리하고 새로 시작할 수 있게 한다. 기존 active
 * 컬렉션은 전혀 건드리지 않는다 — 서비스 중인 검색에는 영향 없음. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const building = listVectorCollections().find(c => c.status === 'building');
  if (!building) return NextResponse.json({ error: '진행 중인 재인덱싱이 없습니다.' }, { status: 404 });

  const deletedJobs = deleteJobsForCollection(building.id);
  setVectorCollectionStatus(building.id, 'failed');

  const qdrantCfg = getQdrantConfig(building.collectionName);
  let qdrantDeleted = false;
  if (qdrantCfg) {
    try { await qdrantDeleteCollection(qdrantCfg); qdrantDeleted = true; } catch { /* Qdrant 쪽 정리는 베스트에포트 — DB 상태는 이미 정리됨 */ }
  }

  return NextResponse.json({ data: { collectionName: building.collectionName, deletedJobs, qdrantDeleted } });
}
