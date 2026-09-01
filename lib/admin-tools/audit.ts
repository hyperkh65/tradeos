import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export type AdminToolsAuditAction =
  | 'TOOL_ENABLED' | 'TOOL_DISABLED' | 'TOOL_MAINTENANCE_ON' | 'TOOL_MAINTENANCE_OFF'
  | 'TOOL_SETTINGS_CHANGED' | 'PLATFORM_SETTINGS_CHANGED';

export interface AdminToolsAuditOpts {
  toolSlug?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: AdminToolsAuditAction;
  before?: unknown;
  after?: unknown;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

/** lib/photos/audit.ts와 동일한 패턴 — 실패해도 호출자의 실제 작업을 막지 않도록 예외를 삼킨다. */
export function writeAdminToolsAuditLog(opts: AdminToolsAuditOpts) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO admin_tools_audit_logs
      (id, tool_slug, user_id, user_name, action, before_json, after_json, ip_address, user_agent, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      newId(), opts.toolSlug ?? null, opts.userId ?? null, opts.userName ?? null, opts.action,
      opts.before !== undefined ? JSON.stringify(opts.before) : null,
      opts.after !== undefined ? JSON.stringify(opts.after) : null,
      clientIp(opts.req), opts.req?.headers.get('user-agent') ?? null, now(),
    );
  } catch (e) {
    console.error('[admin-tools audit]', e);
  }
}
