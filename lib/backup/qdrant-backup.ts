import fs from 'fs';
import path from 'path';
import { getQdrantConfig } from '../ai/qdrant-config';
import { qdrantCreateSnapshot, qdrantDownloadSnapshot, qdrantGetCollectionInfo } from '../ai/vectorstore/qdrant';

export interface QdrantBackupResult {
  attempted: boolean;
  ok: boolean;
  snapshotFile: string | null;
  collectionName: string | null;
  pointsCount: number | null;
  error: string | null;
}

/** 활성 Qdrant 컬렉션의 snapshot을 만들어 destDir에 저장한다. Qdrant가 꺼져있거나
 * 설정되지 않았어도 백업 전체를 실패시키지 않는다 — Qdrant는 rebuildable 도메인이라
 * (원본 DB/NAS 기준 재인덱싱 가능) snapshot 실패는 WARNING이지 FAILED가 아니다. */
export async function backupQdrantSnapshot(destDir: string): Promise<QdrantBackupResult> {
  const cfg = getQdrantConfig();
  if (!cfg) {
    return { attempted: false, ok: false, snapshotFile: null, collectionName: null, pointsCount: null, error: 'Qdrant가 설정되지 않았습니다.' };
  }
  try {
    const info = await qdrantGetCollectionInfo(cfg);
    if (!info.exists) {
      return { attempted: true, ok: false, snapshotFile: null, collectionName: cfg.collection, pointsCount: 0, error: '활성 컬렉션이 아직 Qdrant에 존재하지 않습니다(인덱싱 전).' };
    }
    const snapshot = await qdrantCreateSnapshot(cfg);
    const buf = await qdrantDownloadSnapshot(cfg, snapshot.name);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${cfg.collection}.snapshot`);
    fs.writeFileSync(dest, buf);
    return { attempted: true, ok: true, snapshotFile: path.basename(dest), collectionName: cfg.collection, pointsCount: info.pointsCount, error: null };
  } catch (e) {
    return { attempted: true, ok: false, snapshotFile: null, collectionName: cfg.collection, pointsCount: null, error: (e as Error).message };
  }
}
