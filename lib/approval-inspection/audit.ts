import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export type AuditAction =
  | 'project_create' | 'project_update' | 'project_delete'
  | 'product_create' | 'product_update' | 'product_delete' | 'product_duplicate' | 'product_reorder'
  | 'measurement_update'
  | 'wire_spec_update'
  | 'photo_upload' | 'photo_replace' | 'photo_delete' | 'photo_edit'
  | 'sample_create' | 'sample_update' | 'sample_delete'
  | 'diff_update'
  | 'link_create' | 'link_reissue'
  | 'draft_save' | 'submit' | 'resubmit'
  | 'close' | 'reopen'
  | 'snapshot_create'
  | 'generate_docx' | 'generate_pdf' | 'generate_xlsx'
  | 'download_docx' | 'download_pdf' | 'download_xlsx' | 'download_zip'
  | 'revision_request_create' | 'revision_request_resolve'
  | 'validation_override';

export interface AuditOpts {
  projectId: string;
  action: AuditAction;
  actorType: 'internal' | 'external';
  actorUserId?: string | null;
  actorUserName?: string | null;
  actorTokenHash?: string | null;
  before?: unknown;
  after?: unknown;
  submissionVersion?: number | null;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

/** lib/approval-doc/audit.ts와 동일한 패턴 — approval_inspection_audit_logs 테이블에 기록. */
export function writeInspectionAuditLog(opts: AuditOpts) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO approval_inspection_audit_logs
      (id, project_id, action, actor_type, actor_user_id, actor_user_name, actor_token_hash,
       before_json, after_json, ip_address, user_agent, submission_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), opts.projectId, opts.action, opts.actorType,
      opts.actorUserId ?? null, opts.actorUserName ?? null, opts.actorTokenHash ?? null,
      opts.before !== undefined ? JSON.stringify(opts.before) : null,
      opts.after !== undefined ? JSON.stringify(opts.after) : null,
      clientIp(opts.req), opts.req?.headers.get('user-agent') ?? null,
      opts.submissionVersion ?? null, now(),
    );
  } catch (e) {
    console.error('[approval-inspection audit]', e);
  }
}
