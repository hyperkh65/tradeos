import { getDb, now } from '@/lib/db/sqlite';

export interface AdminToolRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  route: string;
  enabled: boolean;
  requiredPermission: string;
  version: string | null;
  maintenanceMode: boolean;
  beta: boolean;
  sortOrder: number;
  settingsSchema: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function rowToTool(r: Record<string, unknown>): AdminToolRow {
  let settingsSchema: Record<string, unknown> | null = null;
  if (r.settings_schema_json) {
    try { settingsSchema = JSON.parse(r.settings_schema_json as string); } catch { /* ignore malformed */ }
  }
  return {
    id: r.id as string, slug: r.slug as string, name: r.name as string, description: r.description as string | null,
    icon: r.icon as string | null, category: r.category as string | null, route: r.route as string,
    enabled: !!r.enabled, requiredPermission: r.required_permission as string, version: r.version as string | null,
    maintenanceMode: !!r.maintenance_mode, beta: !!r.beta, sortOrder: r.sort_order as number,
    settingsSchema, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

/** 등록된 전체 도구 — 카드 그리드가 이 하나의 쿼리만으로 렌더링된다(하드코딩된
 * if 체인 없음). 새 도구를 추가하려면 admin_tools에 행 하나 INSERT하면 끝. */
export function listAdminTools(): AdminToolRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM admin_tools ORDER BY sort_order ASC, created_at ASC`).all() as Record<string, unknown>[];
  return rows.map(rowToTool);
}

export function getAdminToolBySlug(slug: string): AdminToolRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM admin_tools WHERE slug=?`).get(slug) as Record<string, unknown> | undefined;
  return row ? rowToTool(row) : null;
}

export interface UpdateAdminToolInput {
  enabled?: boolean;
  maintenanceMode?: boolean;
  sortOrder?: number;
}

export function updateAdminTool(slug: string, patch: UpdateAdminToolInput): AdminToolRow | null {
  const db = getDb();
  const existing = getAdminToolBySlug(slug);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  db.prepare(`UPDATE admin_tools SET enabled=?, maintenance_mode=?, sort_order=?, updated_at=? WHERE slug=?`)
    .run(merged.enabled ? 1 : 0, merged.maintenanceMode ? 1 : 0, merged.sortOrder, now(), slug);
  return getAdminToolBySlug(slug);
}
