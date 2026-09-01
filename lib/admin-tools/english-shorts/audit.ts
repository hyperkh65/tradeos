import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

/** 요청서 60번 — English Shorts 자체 감사로그(admin_tools_audit_logs는 플랫폼
 * 레지스트리 레벨 액션 전용이라 분리). */
export type EnglishShortsAuditAction =
  | 'PROJECT_CREATED' | 'PROJECT_DELETED' | 'AI_GENERATED'
  | 'SOURCE_UPLOADED' | 'SOURCE_REMOVED'
  | 'RENDER_STARTED' | 'RENDER_COMPLETED' | 'RENDER_FAILED'
  | 'OUTPUT_DOWNLOADED' | 'SETTINGS_CHANGED';

export interface EnglishShortsAuditOpts {
  projectId?: string | null;
  sourceId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: EnglishShortsAuditAction;
  before?: unknown;
  after?: unknown;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export function writeEnglishShortsAuditLog(opts: EnglishShortsAuditOpts) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO es_audit_logs
      (id, project_id, source_id, user_id, user_name, action, before_json, after_json, ip_address, user_agent, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      newId(), opts.projectId ?? null, opts.sourceId ?? null, opts.userId ?? null, opts.userName ?? null, opts.action,
      opts.before !== undefined ? JSON.stringify(opts.before) : null,
      opts.after !== undefined ? JSON.stringify(opts.after) : null,
      clientIp(opts.req), opts.req?.headers.get('user-agent') ?? null, now(),
    );
  } catch (e) {
    console.error('[english-shorts audit]', e);
  }
}
