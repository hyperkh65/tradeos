import { getDb, newId, now } from '../db/sqlite';

export interface SystemChangeEntry {
  id: string; occurredAt: string; category: string; summary: string; details: string | null; createdBy: string | null; createdAt: string;
}

function rowToEntry(r: Record<string, unknown>): SystemChangeEntry {
  return {
    id: r.id as string, occurredAt: r.occurred_at as string, category: r.category as string,
    summary: r.summary as string, details: r.details as string | null,
    createdBy: r.created_by as string | null, createdAt: r.created_at as string,
  };
}

/** CHANGE_HISTORY.md는 매번 새로 "생성"하지 않고 DB에 누적된 이 로그를 매 백업
 * 시점에 스냅샷으로 포함한다 — 관리자가 직접 추가할 수도, 기능 개발 중 코드에서
 * 기록할 수도 있다(예: 이번 AI Assistant 개편). */
export function logSystemChange(input: { category: string; summary: string; details?: string; createdBy?: string; occurredAt?: string }): void {
  const db = getDb();
  const ts = now();
  db.prepare(`INSERT INTO system_change_log (id, occurred_at, category, summary, details, created_by, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(newId(), input.occurredAt || ts, input.category, input.summary, input.details || null, input.createdBy || null, ts);
}

export function listSystemChanges(limit = 200): SystemChangeEntry[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM system_change_log ORDER BY occurred_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
  return rows.map(rowToEntry);
}

/** 앱 기동 시 1회만 실행 — 이미 시딩됐으면 건너뛴다. 이번 세션에 실제로 있었던 주요
 * 변경을 첫 이력으로 남겨서, CHANGE_HISTORY.md가 빈 문서로 시작하지 않게 한다. */
export function seedInitialChangeHistory(): void {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) as n FROM system_change_log`).get() as { n: number };
  if (existing.n > 0) return;
  const seeds: { category: string; summary: string; details?: string }[] = [
    { category: 'ai', summary: 'AI Chat 모델을 llama-3.3-70b-instruct에서 glm-4.7-flash로 교체', details: 'Cloudflare 무료 Neuron 한도 소진 속도 개선' },
    { category: 'ai', summary: 'AI Embedding 모델을 bge-base-en-v1.5(영어전용)에서 bge-m3(다국어)로 교체', details: '한국어 검색 품질 개선, Qdrant 컬렉션 v1(legacy)→v2 전환 체계 도입' },
    { category: 'ai', summary: 'Qdrant 검색 결과에 bge-reranker-base 재정렬 단계 추가', details: 'top 10 검색 → rerank → 관련성 임계값 → top 3~5만 LLM에 전달' },
    { category: 'ai', summary: 'Intent Router 도입 — 질문 종류별 Tool 서브셋/Fast Path/조건부 프롬프트', details: '불필요한 Qdrant/DB 호출과 LLM 이중호출 축소' },
    { category: 'infra', summary: 'Qdrant 배포 직후 fetch failed 문제 근본 수정', details: 'Qdrant 클라이언트 재시도/백오프 + 배포 스크립트 컨테이너 기동 대기 추가' },
    { category: 'backup', summary: '완전 자가복구형 Disaster Recovery / Active Backup System 도입', details: 'Secrets Vault, System Manifest, Qdrant snapshot, 도메인 마이그레이션, 복구 엔진 등' },
  ];
  for (const s of seeds) logSystemChange({ ...s, createdBy: 'system-seed' });
}
