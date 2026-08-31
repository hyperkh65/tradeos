import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

/** 요청서 13번 그대로 — 일반 사용자는 지울 수 없고(별도 삭제 API 없음), 앱 레벨에서만 write. */
export type PhotoAuditAction =
  | 'UPLOAD' | 'MOVE' | 'COPY' | 'ADD_TO_ALBUM' | 'REMOVE_FROM_ALBUM'
  | 'RENAME' | 'EDIT_DESCRIPTION' | 'TAG_ADD' | 'TAG_REMOVE'
  | 'SHARE_CREATED' | 'SHARE_CHANGED' | 'SHARE_REVOKED'
  | 'DOWNLOAD' | 'DELETE' | 'RESTORE' | 'PERMANENT_DELETE';

export interface PhotoAuditOpts {
  photoId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: PhotoAuditAction;
  before?: unknown;
  after?: unknown;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

/** lib/approval-doc/audit.ts와 동일한 패턴 — 실패해도(예: DB 잠깐 바쁨) 호출자의 진짜
 * 작업(업로드/삭제 등)을 절대 막지 않도록 예외를 삼킨다. */
export function writePhotoAuditLog(opts: PhotoAuditOpts) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO photo_audit_logs
      (id, photo_id, user_id, user_name, action, before_json, after_json, ip_address, user_agent, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      newId(), opts.photoId ?? null, opts.userId ?? null, opts.userName ?? null, opts.action,
      opts.before !== undefined ? JSON.stringify(opts.before) : null,
      opts.after !== undefined ? JSON.stringify(opts.after) : null,
      clientIp(opts.req), opts.req?.headers.get('user-agent') ?? null, now(),
    );
  } catch (e) {
    console.error('[photo audit]', e);
  }
}
