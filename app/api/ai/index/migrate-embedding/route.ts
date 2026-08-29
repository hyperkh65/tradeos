import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listAllSourceIds, INDEXABLE_SOURCE_TYPES } from '@/lib/ai/sources';
import { enqueueIndexJob, hasActiveJob, listVectorCollections, createVectorCollection, getActiveVectorCollection } from '@/lib/ai/db';
import { embedTexts } from '@/lib/ai/embeddings';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';
import { qdrantEnsureCollection } from '@/lib/ai/vectorstore/qdrant';

/** 다음 버전 컬렉션 이름을 만든다 — 기존 이름에 붙은 "_v숫자" 접미사를 떼어 base로
 * 쓰고, 지금까지 등록된 컬렉션 중 가장 큰 버전 다음 번호를 붙인다(v1→v2, 다음에
 * 다시 돌리면 v2→v3 ... 하드코딩된 "v2"에 의존하지 않음). */
function nextCollectionName(baseCollectionName: string): string {
  const base = baseCollectionName.replace(/_v\d+$/, '');
  const existing = listVectorCollections();
  let maxVersion = 1;
  for (const c of existing) {
    const m = c.collectionName.match(/_v(\d+)$/);
    if (m && c.collectionName.replace(/_v\d+$/, '') === base) {
      maxVersion = Math.max(maxVersion, parseInt(m[1], 10));
    }
  }
  return `${base}_v${maxVersion + 1}`;
}

/** 새 Embedding 모델로 전체 자료를 재인덱싱한다. 기존 자료는 삭제하지 않고, 새
 * Qdrant 컬렉션을 만들어 백그라운드(ai_index_jobs 워커)에서 다시 인덱싱한다 —
 * 완료 후(jobs.ts의 checkAndActivatePendingMigrations) 자동으로 active 전환된다.
 * 실패한 건이 남으면 전환하지 않고 기존 컬렉션이 계속 서비스된다. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const alreadyBuilding = listVectorCollections().find(c => c.status === 'building');
  if (alreadyBuilding) {
    return NextResponse.json({ error: `이미 진행 중인 재인덱싱이 있습니다(${alreadyBuilding.collectionName}). 완료 후 다시 시도하세요.` }, { status: 409 });
  }

  const active = getActiveVectorCollection();
  if (!active) return NextResponse.json({ error: '활성 컬렉션 설정을 찾을 수 없습니다.' }, { status: 500 });

  // 차원을 추측하지 않고 실제 embed 호출로 확정한다.
  let probe;
  try {
    probe = await embedTexts(['_dimension_probe_']);
  } catch (e) {
    return NextResponse.json({ error: `임베딩 모델 확인 실패: ${(e as Error).message}` }, { status: 502 });
  }

  const collectionName = nextCollectionName(active.collectionName);
  const newCollection = createVectorCollection({
    collectionName, embeddingProvider: 'cloudflare', embeddingModel: probe.model,
    embeddingDimension: probe.dimensions, embeddingVersion: `${probe.model}:${probe.dimensions}d`, status: 'building',
  });

  const qdrantCfg = getQdrantConfig(collectionName);
  if (!qdrantCfg) return NextResponse.json({ error: 'Qdrant가 설정되지 않았습니다.' }, { status: 500 });
  try {
    await qdrantEnsureCollection(qdrantCfg, probe.dimensions);
  } catch (e) {
    return NextResponse.json({ error: `Qdrant 컬렉션 생성 실패: ${(e as Error).message}` }, { status: 502 });
  }

  let enqueued = 0;
  let skipped = 0;
  for (const sourceType of INDEXABLE_SOURCE_TYPES) {
    for (const sourceId of listAllSourceIds(sourceType)) {
      if (hasActiveJob(sourceType, sourceId, newCollection.id)) { skipped++; continue; }
      enqueueIndexJob(sourceType, sourceId, 'update', newCollection.id);
      enqueued++;
    }
  }

  return NextResponse.json({ data: { collectionId: newCollection.id, collectionName, embeddingModel: probe.model, dimension: probe.dimensions, enqueued, skipped } });
}
