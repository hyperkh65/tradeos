import { getDb } from '@/lib/db/sqlite';

/** created_by 컬럼이 있는 테이블 → 사이드바 탭에 대응하는 한국어 라벨.
 * 여기 없는(향후 새로 생기는) 테이블은 라벨 없이 테이블명 그대로 표시된다 —
 * 조용히 누락시키지 않기 위함(DR 시스템의 registry.ts와 동일한 원칙). */
export const CREATED_BY_TABLE_LABELS: Record<string, string> = {
  quotes: '견적',
  purchase_orders: '발주',
  claims: '클레임',
  commissions: '커미션',
  cost_records: '비용 원장',
  channels: '메신저(대화방 생성)',
  approval_doc_projects: '제품 승인서·사양서',
  approval_doc_templates: '승인서 브랜드/템플릿',
  approval_doc_links: '승인서 공유링크',
  approval_doc_image_placements: '승인서 이미지배치',
  supplier_request_projects: '고효율서류요청서',
  supplier_request_links: '고효율서류요청서 링크',
  expenses: '지출관리',
  documents: '문서(정산서 등)',
  calendar_events: '일정',
  forwarder_rates: '포워더운임',
  journal_entries: '회계전표',
  foreign_invoices: '외화 인보이스',
  po_qty_adjustments: '발주 수량조정',
  profit_analyses: '수익분석',
  company_brand_profiles: '승인서 브랜드/템플릿',
  file_folders: '파일 폴더',
};

/** 시스템 내부용이라 "사용자가 작성한 업무 콘텐츠"로 보기 어려운 테이블은 집계에서 뺀다. */
const EXCLUDED_TABLES = new Set(['ai_providers', 'notifications', 'system_change_log']);

export interface ModuleActivity { table: string; label: string; count: number; lastAt: string | null }
export interface UserActivity {
  userId: string; userName: string; email: string; role: string; status: string;
  loginCount: number; lastLoginAt: string | null;
  totalCreated: number; byModule: ModuleActivity[];
}

/** created_by 컬럼을 가진 테이블을 스키마에서 직접 찾는다 — 새 기능이 이 컬럼
 * 이름 규칙을 따르면 코드 수정 없이 자동으로 집계 대상에 포함된다. */
function findCreatedByTables(): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT m.name as tbl FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
    WHERE m.type='table' AND p.name='created_by'
  `).all() as { tbl: string }[];
  return rows.map(r => r.tbl).filter(t => !EXCLUDED_TABLES.has(t));
}

/** 사용자별 로그인 이력 + 각 모듈(탭)에서 만든 데이터 건수를 계산한다.
 * 제품/검품/거래처/선적/수입통관/재고/계약/매출/견적계산기 등은 애초에 created_by
 * 컬럼이 없어(레거시 스키마) 이 집계에 포함되지 않는다 — 화면에서 이 한계를
 * 명시한다(조용히 완전한 것처럼 보이면 안 됨). */
export function computeUserActivity(): UserActivity[] {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, status FROM users ORDER BY name').all() as
    { id: string; name: string; email: string; role: string; status: string }[];

  const loginRows = db.prepare(
    `SELECT user_id, COUNT(*) as cnt, MAX(created_at) as last FROM user_login_logs GROUP BY user_id`
  ).all() as { user_id: string; cnt: number; last: string }[];
  const loginStats = new Map(loginRows.map(r => [r.user_id, { cnt: r.cnt, last: r.last }]));

  const tables = findCreatedByTables();
  const perUser = new Map<string, ModuleActivity[]>();
  for (const table of tables) {
    const label = CREATED_BY_TABLE_LABELS[table] || table;
    let rows: { created_by: string; cnt: number; last: string | null }[];
    try {
      rows = db.prepare(
        `SELECT created_by, COUNT(*) as cnt, MAX(created_at) as last FROM ${table} WHERE created_by IS NOT NULL AND created_by <> '' GROUP BY created_by`
      ).all() as { created_by: string; cnt: number; last: string | null }[];
    } catch { continue; }
    for (const row of rows) {
      const list = perUser.get(row.created_by) || [];
      list.push({ table, label, count: row.cnt, lastAt: row.last });
      perUser.set(row.created_by, list);
    }
  }

  return users.map(u => {
    const login = loginStats.get(u.id);
    const byModule = (perUser.get(u.id) || []).sort((a, b) => b.count - a.count);
    return {
      userId: u.id, userName: u.name, email: u.email, role: u.role, status: u.status,
      loginCount: login?.cnt ?? 0, lastLoginAt: login?.last ?? null,
      totalCreated: byModule.reduce((s, m) => s + m.count, 0),
      byModule,
    };
  });
}

export interface UnattributedEntry { table: string; label: string; count: number }

/** created_by 값이 실제 users.id 중 어디에도 매칭되지 않는 레거시 데이터(예:
 * 초기 마이그레이션 기본값 'user-1', ERP 연동 표시값 'ynk-erp')가 있으면 그
 * 존재를 화면에 투명하게 알린다 — 특정 사용자 것으로 잘못 귀속시키지 않는다. */
export function computeUnattributedSummary(): UnattributedEntry[] {
  const db = getDb();
  const tables = findCreatedByTables();
  const userIds = new Set((db.prepare('SELECT id FROM users').all() as { id: string }[]).map(r => r.id));
  const out: UnattributedEntry[] = [];
  for (const table of tables) {
    let rows: { created_by: string; cnt: number }[];
    try {
      rows = db.prepare(`SELECT created_by, COUNT(*) as cnt FROM ${table} WHERE created_by IS NOT NULL AND created_by <> '' GROUP BY created_by`).all() as { created_by: string; cnt: number }[];
    } catch { continue; }
    const unmatched = rows.filter(r => !userIds.has(r.created_by)).reduce((s, r) => s + r.cnt, 0);
    if (unmatched > 0) out.push({ table, label: CREATED_BY_TABLE_LABELS[table] || table, count: unmatched });
  }
  return out;
}
