import { buildSourceDocument, listAttachmentSourceIdsForParent, type IndexableSourceType } from './sources';
import { chunkText, deriveCharBudget } from './chunking';
import { embedTexts, deterministicPointId, sha256 } from './embeddings';
import { getQdrantConfig } from './qdrant-config';
import { qdrantEnsureCollection, qdrantUpsertPoints, qdrantDeleteByFilter, qdrantDeletePoints } from './vectorstore/qdrant';
import { getDocumentIndexRow, upsertDocumentIndexRow, deleteDocumentIndexRow, enqueueIndexJob, hasActiveJob, listDocumentIndex } from './db';
import { MODEL_REGISTRY } from './models';

/** 이미 인덱싱된 내용과 해시가 같으면 재임베딩하지 않는다 — 무료 임베딩 호출 수를
 * 아끼기 위한 핵심 장치(변경 없는 문서를 매번 다시 임베딩하면 비용이 선형으로 늘어남). */
export async function indexOneSource(sourceType: IndexableSourceType, sourceId: string): Promise<{ status: 'skipped' | 'indexed' | 'deleted' }> {
  const doc = await buildSourceDocument(sourceType, sourceId);
  if (!doc) {
    await deleteOneSource(sourceType, sourceId);
    return { status: 'deleted' };
  }

  // 검품/클레임을 재인덱싱할 때, 그 밑에 달린 리포트 첨부파일(PDF/DOCX/XLSX)도 함께
  // 최신 상태로 맞춘다 — 이미 삭제된 첨부파일의 옛 인덱스는 정리하고, 현재 남아있는
  // 파일만 큐에 넣는다(각 파일은 자기 content-hash로 알아서 변경분만 재임베딩됨).
  if (sourceType === 'inspection' || sourceType === 'claim') {
    await syncAttachmentsForParent(sourceType, sourceId);
  }

  const contentHash = sha256(doc.text);
  const existing = getDocumentIndexRow(sourceType, sourceId);
  if (existing && existing.contentHash === contentHash && existing.status === 'indexed') {
    return { status: 'skipped' };
  }

  try {
    const qdrantCfg = getQdrantConfig();
    if (!qdrantCfg) throw new Error('Qdrant가 설정되지 않았습니다(관리자 설정에서 Qdrant URL을 등록하세요).');

    // 특정 임베딩 모델에 하드코딩하지 않고, 등록된 임베딩 모델 중 가장 작은 컨텍스트에
    // 맞춰 청크 예산을 잡는다(어떤 모델이 실제로 선택되든 안전하게 들어가도록).
    const embeddingModels = MODEL_REGISTRY.filter(m => m.embedding && m.enabled);
    const smallestContext = embeddingModels.length ? Math.min(...embeddingModels.map(m => m.maxContext)) : 512;
    const maxChars = deriveCharBudget(smallestContext);
    const chunks = chunkText(doc.text, { maxChars, overlapChars: Math.floor(maxChars * 0.15) });
    if (chunks.length === 0) {
      deleteDocumentIndexRow(sourceType, sourceId);
      return { status: 'skipped' };
    }

    const embedResult = await embedTexts(chunks.map(c => c.text));
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
      sourceType, sourceId, title: doc.title, contentHash, chunkCount: chunks.length,
      embeddingModel: embedResult.model, embeddingVersion: `${embedResult.model}:${embedResult.dimensions}d`,
      sourceUpdatedAt: doc.sourceUpdatedAt, departmentId: doc.departmentId, visibility: doc.visibility,
      securityLevel: doc.securityLevel, status: 'indexed',
    });
    return { status: 'indexed' };
  } catch (e) {
    upsertDocumentIndexRow({
      sourceType, sourceId, title: doc.title, contentHash, chunkCount: existing?.chunkCount ?? 0,
      embeddingModel: existing?.embeddingModel ?? '', embeddingVersion: existing?.embeddingVersion ?? '',
      sourceUpdatedAt: doc.sourceUpdatedAt, departmentId: doc.departmentId, visibility: doc.visibility,
      securityLevel: doc.securityLevel, status: 'failed', error: (e as Error).message,
    });
    throw e;
  }
}

export async function deleteOneSource(sourceType: IndexableSourceType, sourceId: string): Promise<void> {
  const existing = getDocumentIndexRow(sourceType, sourceId);
  const qdrantCfg = getQdrantConfig();
  if (qdrantCfg && existing) {
    await qdrantDeleteByFilter(qdrantCfg, {
      must: [{ key: 'sourceType', match: { value: sourceType } }, { key: 'sourceId', match: { value: sourceId } }],
    });
  }
  deleteDocumentIndexRow(sourceType, sourceId);

  // 검품/클레임 자체가 삭제되면 그 첨부파일 인덱스도 고아로 남지 않게 함께 정리한다.
  if (sourceType === 'inspection' || sourceType === 'claim') {
    const prefix = `${sourceType}:${sourceId}:`;
    const attachmentRows = listDocumentIndex({ limit: 1000 }).filter(r => r.sourceType === 'attachment' && r.sourceId.startsWith(prefix));
    for (const row of attachmentRows) await deleteOneSource('attachment', row.sourceId);
  }
}

async function syncAttachmentsForParent(parentType: 'inspection' | 'claim', parentId: string): Promise<void> {
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
