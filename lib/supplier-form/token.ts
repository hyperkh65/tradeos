import crypto from 'crypto';
import { getDb, newId, now } from '@/lib/db/sqlite';

/** 256비트 URL-safe 랜덤 토큰. 원문은 절대 DB에 저장하지 않는다. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface SupplierProject {
  id: string; business_id: string; product_name: string; internal_ref_no: string | null;
  supplier_name: string; contact_person: string | null; requested_at: string | null; due_date: string | null;
  memo: string | null; default_language: string; status: string; template_version: string;
  created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
}

export interface ResolvedLink {
  project: SupplierProject;
  linkId: string;
}

/**
 * 토큰으로 프로젝트를 조회한다. 모든 외부 API 라우트가 매 요청마다 이 함수를 호출해야 한다.
 * - 존재하지 않거나 비활성화(재발급으로 폐기)된 링크면 null
 * - URL의 프로젝트ID가 아니라 토큰 자체가 프로젝트를 결정하므로, 다른 프로젝트 데이터 접근이 원천 차단됨
 */
export function resolveProjectByToken(token: string): ResolvedLink | null {
  if (!token || token.length < 20) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const link = db.prepare('SELECT id, project_id FROM supplier_request_links WHERE token_hash=? AND is_active=1')
    .get(tokenHash) as { id: string; project_id: string } | undefined;
  if (!link) return null;
  const project = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(link.project_id) as SupplierProject | undefined;
  if (!project) return null;
  return { project, linkId: link.id };
}

export function createLink(projectId: string, createdBy: string, createdByName: string): { token: string; linkId: string } {
  const db = getDb();
  const token = generateToken();
  const id = newId();
  db.prepare(`INSERT INTO supplier_request_links (id, project_id, token_hash, is_active, created_by, created_by_name, created_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)`).run(id, projectId, hashToken(token), createdBy, createdByName, now());
  return { token, linkId: id };
}

export type GuardResult =
  | { ok: true; project: SupplierProject; linkId: string }
  | { ok: false; status: number; error: string };

/**
 * 외부 라우트 공통 진입점: 토큰 검증 + (필요시) 마감 상태 확인.
 * requireEditable=true면 마감(closed) 상태에서 423을 반환한다 — 화면 버튼을 숨기는 것과
 * 별개로, 이 체크가 실제 방어선이다(개발자도구/직접 API 호출도 여기서 막힘).
 */
export function guardSupplierRequest(token: string, requireEditable: boolean): GuardResult {
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
  db.prepare(`UPDATE supplier_request_links SET is_active=0, revoked_at=?, revoked_reason=? WHERE project_id=? AND is_active=1`)
    .run(now(), reason, projectId);
  return createLink(projectId, createdBy, createdByName);
}
