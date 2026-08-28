import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export type AuditAction =
  | 'project_create' | 'project_update'
  | 'section_toggle' | 'section_reorder' | 'section_create' | 'section_delete'
  | 'link_create' | 'link_reissue'
  | 'draft_save' | 'submit' | 'resubmit'
  | 'file_upload' | 'file_replace' | 'file_delete'
  | 'close' | 'reopen' | 'new_revision'
  | 'generate_docx' | 'generate_pdf'
  | 'download_docx' | 'download_pdf' | 'download_xlsx' | 'download_zip'
  | 'template_change' | 'brand_profile_apply' | 'brand_profile_create'
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
  relatedAttachmentId?: string | null;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

/** lib/supplier-form/audit.ts와 동일한 패턴 — approval_doc_audit_logs 테이블에 기록. */
export function writeApprovalAuditLog(opts: AuditOpts) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO approval_doc_audit_logs
      (id, project_id, action, actor_type, actor_user_id, actor_user_name, actor_token_hash,
       before_json, after_json, ip_address, user_agent, submission_version, related_attachment_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), opts.projectId, opts.action, opts.actorType,
      opts.actorUserId ?? null, opts.actorUserName ?? null, opts.actorTokenHash ?? null,
      opts.before !== undefined ? JSON.stringify(opts.before) : null,
      opts.after !== undefined ? JSON.stringify(opts.after) : null,
      clientIp(opts.req), opts.req?.headers.get('user-agent') ?? null,
      opts.submissionVersion ?? null, opts.relatedAttachmentId ?? null, now(),
    );
  } catch (e) {
    console.error('[approval-doc audit]', e);
  }
}
