import { buildSourceDocument, listAttachmentSourceIdsForParent, type IndexableSourceType, type AttachmentParentType } from './sources';

const ATTACHMENT_PARENT_SOURCE_TYPES = new Set<IndexableSourceType>(['inspection', 'claim', 'purchaseorder', 'shipment', 'import', 'commission']);
import { chunkText, deriveCharBudget } from './chunking';
import { embedTexts, deterministicPointId, sha256 } from './embeddings';
import { getQdrantConfig } from './qdrant-config';
import { qdrantEnsureCollection, qdrantUpsertPoints, qdrantDeleteByFilter, qdrantDeletePoints } from './vectorstore/qdrant';
import { getDocumentIndexRow, upsertDocumentIndexRow, deleteDocumentIndexRow, enqueueIndexJob, hasActiveJob, listDocumentIndex, getActiveVectorCollection, getVectorCollection } from './db';
import { MODEL_REGISTRY } from './models';

/** 이미 인덱싱된 내용과 해시가 같으면 재임베딩하지 않는다 — 무료 임베딩 호출 수를
 * 아끼기 위한 핵심 장치(변경 없는 문서를 매번 다시 임베딩하면 비용이 선형으로 늘어남).
 *
 * targetCollectionId를 넘기면(재인덱싱 마이그레이션 전용) 활성 컬렉션이 아니라 그
 * 컬렉션으로 색인한다 — ai_document_index 조회/기록도 그 컬렉션으로 범위가 좁혀지므로,
 * 같은 source가 활성(v1) 컬렉션과 building(v2) 컬렉션에 동시에 별도 상태로 존재할 수
 * 있고, 마이그레이션 도중에도 v1 검색은 전혀 영향을 받지 않는다. */
export async function indexOneSource(sourceType: IndexableSourceType, sourceId: string, targetCollectionId?: string): Promise<{ status: 'skipped' | 'indexed' | 'deleted' }> {
  const doc = await buildSourceDocument(sourceType, sourceId);
  if (!doc) {
    await deleteOneSource(sourceType, sourceId, targetCollectionId);
    return { status: 'deleted' };
  }

  // 검품/클레임/발주/선적/수입통관/커미션을 재인덱싱할 때, 그 밑에 달린 첨부문서
  // (PDF/DOCX/XLSX)도 함께 최신 상태로 맞춘다 — 이미 삭제된 첨부파일의 옛 인덱스는
  // 정리하고, 현재 남아있는 파일만 큐에 넣는다(각 파일은 자기 content-hash로
  // 알아서 변경분만 재임베딩됨). 마이그레이션 중(targetCollectionId 있음)에는 첨부파일도
  // sources.ts의 listAllSourceIds('attachment')가 별도로 순회하므로 여기서는 건너뛴다.
  if (!targetCollectionId && ATTACHMENT_PARENT_SOURCE_TYPES.has(sourceType)) {
    await syncAttachmentsForParent(sourceType as AttachmentParentType, sourceId);
  }

  const contentHash = sha256(doc.text);
  const existing = getDocumentIndexRow(sourceType, sourceId, targetCollectionId);
  if (existing && existing.contentHash === contentHash && existing.status === 'indexed') {
    return { status: 'skipped' };
  }

  try {
    const targetCollection = targetCollectionId ? getVectorCollection(targetCollectionId) : getActiveVectorCollection();
    if (targetCollectionId && !targetCollection) throw new Error('대상 컬렉션을 찾을 수 없습니다.');
    const qdrantCfg = getQdrantConfig(targetCollection?.collectionName);
    if (!qdrantCfg) throw new Error('Qdrant가 설정되지 않았습니다(관리자 설정에서 Qdrant URL을 등록하세요).');

    // 특정 임베딩 모델에 하드코딩하지 않고, 등록된 임베딩 모델 중 가장 작은 컨텍스트에
    // 맞춰 청크 예산을 잡는다(어떤 모델이 실제로 선택되든 안전하게 들어가도록).
    const embeddingModels = MODEL_REGISTRY.filter(m => m.embedding && m.enabled);
    const smallestContext = embeddingModels.length ? Math.min(...embeddingModels.map(m => m.maxContext)) : 512;
    const maxChars = deriveCharBudget(smallestContext);
    const chunks = chunkText(doc.text, { maxChars, overlapChars: Math.floor(maxChars * 0.15) });
    if (chunks.length === 0) {
      deleteDocumentIndexRow(sourceType, sourceId, targetCollectionId);
      return { status: 'skipped' };
    }

    const embedResult = await embedTexts(chunks.map(c => c.text));

    // 대상 컬렉션(마이그레이션 중이면 building v2, 아니면 활성 컬렉션)에 등록된 임베딩
    // 모델과 실제로 호출된 모델이 다르면 절대 upsert하지 않는다 — Provider 계정마다
    // embeddingModel 설정이 어긋나면 같은 컬렉션에 서로 다른 차원/의미공간의 벡터가
    // 섞여 검색 결과 전체가 오염된다(Chat quota가 소진됐다고 다른 embedding model로
    // 바뀌면 안 된다).
    if (targetCollection && targetCollection.embeddingModel !== embedResult.model) {
      throw new Error(`임베딩 모델 불일치: 대상 컬렉션은 ${targetCollection.embeddingModel}인데 ${embedResult.model}로 임베딩됨 — upsert 중단`);
    }

    await qdrantEnsureCollection(qdrantCfg, embedResult.dimensions);

    const points = chunks.map((c, i) => ({
      id: deterministicPointId(`${sourceType}:${sourceId}:${i}`),
      vector: embedResult.vectors[i],
      payload: {
        sourceType, sourceId, chunkIndex: i, title: doc.title, text: c.text,
        departmentId: doc.departmentId ?? null, visibility: doc.visibility ?? null, securityLevel: doc.securityLevel ?? null,
        sourceUpdatedAt: doc.sourceUpdatedAt, contentHash,
      },
    }));
    await qdrantUpsertPoints(qdrantCfg, points);

    // 이전 인덱싱보다 청크 수가 줄었으면, 남은 옛 포인트를 지운다(고아 벡터 방지).
    if (existing && existing.chunkCount > chunks.length) {
      const staleIds = Array.from({ length: existing.chunkCount - chunks.length }, (_, k) => deterministicPointId(`${sourceType}:${sourceId}:${chunks.length + k}`));
      await qdrantDeletePoints(qdrantCfg, staleIds);
    }

    upsertDocumentIndexRow({
      sourceType, sourceId, collectionId: targetCollectionId, title: doc.title, contentHash, chunkCount: chunks.length,
      embeddingModel: embedResult.model, embeddingVersion: `${embedResult.model}:${embedResult.dimensions}d`,
      sourceUpdatedAt: doc.sourceUpdatedAt, departmentId: doc.departmentId, visibility: doc.visibility,
      securityLevel: doc.securityLevel, status: 'indexed',
    });
    return { status: 'indexed' };
  } catch (e) {
    upsertDocumentIndexRow({
      sourceType, sourceId, collectionId: targetCollectionId, title: doc.title, contentHash, chunkCount: existing?.chunkCount ?? 0,
      embeddingModel: existing?.embeddingModel ?? '', embeddingVersion: existing?.embeddingVersion ?? '',
      sourceUpdatedAt: doc.sourceUpdatedAt, departmentId: doc.departmentId, visibility: doc.visibility,
      securityLevel: doc.securityLevel, status: 'failed', error: (e as Error).message,
    });
    throw e;
  }
}

export async function deleteOneSource(sourceType: IndexableSourceType, sourceId: string, targetCollectionId?: string): Promise<void> {
  const existing = getDocumentIndexRow(sourceType, sourceId, targetCollectionId);
  const targetCollection = targetCollectionId ? getVectorCollection(targetCollectionId) : getActiveVectorCollection();
  const qdrantCfg = getQdrantConfig(targetCollection?.collectionName);
  if (qdrantCfg && existing) {
    await qdrantDeleteByFilter(qdrantCfg, {
      must: [{ key: 'sourceType', match: { value: sourceType } }, { key: 'sourceId', match: { value: sourceId } }],
    });
  }
  deleteDocumentIndexRow(sourceType, sourceId, targetCollectionId);

  // 부모 레코드 자체가 삭제되면 그 첨부파일 인덱스도 고아로 남지 않게 함께 정리한다.
  if (ATTACHMENT_PARENT_SOURCE_TYPES.has(sourceType)) {
    const prefix = `${sourceType}:${sourceId}:`;
    const attachmentRows = listDocumentIndex({ limit: 1000, collectionId: targetCollectionId }).filter(r => r.sourceType === 'attachment' && r.sourceId.startsWith(prefix));
    for (const row of attachmentRows) await deleteOneSource('attachment', row.sourceId, targetCollectionId);
  }
}

async function syncAttachmentsForParent(parentType: AttachmentParentType, parentId: string): Promise<void> {
  const prefix = `${parentType}:${parentId}:`;
  const currentIds = new Set(listAttachmentSourceIdsForParent(parentType, parentId));

  // 더 이상 존재하지 않는(삭제된) 첨부파일의 옛 인덱스 정리
  const indexedAttachments = listDocumentIndex({ limit: 1000 }).filter(r => r.sourceType === 'attachment' && r.sourceId.startsWith(prefix));
  for (const row of indexedAttachments) {
    if (!currentIds.has(row.sourceId)) await deleteOneSource('attachment', row.sourceId);
  }

  // 현재 남아있는 첨부파일은 큐에 넣는다(각자 content-hash로 변경분만 재임베딩됨)
  for (const sourceId of currentIds) {
    if (!hasActiveJob('attachment', sourceId)) enqueueIndexJob('attachment', sourceId, 'update');
  }
}
