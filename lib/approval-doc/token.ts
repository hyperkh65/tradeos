import crypto from 'crypto';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { encryptPassword, decryptPassword } from '@/lib/mail/crypto';

/** lib/supplier-form/token.ts와 완전히 동일한 보안 패턴 — 256비트 URL-safe 랜덤 토큰,
 * 원문은 절대 DB에 저장하지 않고 해시만 실제 인증 경로로 사용한다. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface ApprovalDocProject {
  id: string; business_id: string; product_name: string; model_name: string;
  doc_type: string; revision: string; customer_name: string | null; supplier_name: string | null;
  contact_person: string | null; product_category: string | null; has_converter: number | null;
  template_id: string | null; brand_profile_id: string | null;
  default_language: string; final_language: string; status: string;
  created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
}

export interface ResolvedLink {
  project: ApprovalDocProject;
  linkId: string;
}

/**
 * 토큰으로 프로젝트를 조회한다 — URL의 프로젝트ID가 아니라 토큰 자체가 프로젝트를
 * 결정하므로 다른 프로젝트 데이터 접근이 원천 차단된다. 모든 외부 API 라우트가 매 요청
 * 마다 이 함수(정확히는 guardApprovalDocRequest)를 호출해야 한다.
 */
export function resolveProjectByToken(token: string): ResolvedLink | null {
  if (!token || token.length < 20) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const link = db.prepare('SELECT id, project_id FROM approval_doc_links WHERE token_hash=? AND is_active=1')
    .get(tokenHash) as { id: string; project_id: string } | undefined;
  if (!link) return null;
  const project = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(link.project_id) as ApprovalDocProject | undefined;
  if (!project) return null;
  return { project, linkId: link.id };
}

export function createLink(projectId: string, createdBy: string, createdByName: string): { token: string; linkId: string } {
  const db = getDb();
  const token = generateToken();
  const id = newId();
  db.prepare(`INSERT INTO approval_doc_links (id, project_id, token_hash, token_encrypted, is_active, created_by, created_by_name, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`).run(id, projectId, hashToken(token), encryptPassword(token), createdBy, createdByName, now());
  return { token, linkId: id };
}

/** 링크를 만든 내부 담당자가 원문 링크를 다시 확인할 때 사용(재발급 없이). */
export function getActiveLinkToken(projectId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT token_encrypted FROM approval_doc_links WHERE project_id=? AND is_active=1')
    .get(projectId) as { token_encrypted: string | null } | undefined;
  if (!row?.token_encrypted) return null;
  try { return decryptPassword(row.token_encrypted); } catch { return null; }
}

export type GuardResult =
  | { ok: true; project: ApprovalDocProject; linkId: string }
  | { ok: false; status: number; error: string };

/**
 * 외부 라우트 공통 진입점: 토큰 검증 + (필요시) 마감 상태 확인. requireEditable=true면
 * 마감(closed) 상태에서 423을 반환한다 — 화면 버튼 숨김과 별개로 이 체크가 실제 방어선.
 */
export function guardApprovalDocRequest(token: string, requireEditable: boolean): GuardResult {
  const resolved = resolveProjectByToken(token);
  if (!resolved) return { ok: false, status: 404, error: '유효하지 않은 링크입니다.' };
  if (requireEditable && resolved.project.status === 'closed') {
    return { ok: false, status: 423, error: '자료 제출이 마감되었습니다. 현재 내용을 수정할 수 없습니다.' };
  }
  return { ok: true, project: resolved.project, linkId: resolved.linkId };
}

/** 기존 링크를 폐기하고 새 링크를 발급한다 (보안상 링크가 과다 유출된 경우). */
export function reissueLink(projectId: string, createdBy: string, createdByName: string, reason: string): { token: string; linkId: string } {
  const db = getDb();
  db.prepare(`UPDATE approval_doc_links SET is_active=0, revoked_at=?, revoked_reason=? WHERE project_id=? AND is_active=1`)
    .run(now(), reason, projectId);
  return createLink(projectId, createdBy, createdByName);
}
