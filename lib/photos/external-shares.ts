import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { encryptPassword, decryptPassword } from '@/lib/mail/crypto';
import { hashSharePassword, verifySharePassword } from '@/lib/photos/share-password';
import { canManageExternalShare, isPhotoAdmin } from '@/lib/photos/permissions';
import { writePhotoAuditLog } from '@/lib/photos/audit';
import { getPhotoOwnership, getPhotoById } from '@/lib/photos/db';

export type ShareResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** approval-doc/token.ts와 동일한 보안 패턴 — 256비트 URL-safe 랜덤, DB엔 해시만
 * 실제 인증 경로로 쓰고 원문은 token_encrypted(재열람용)로만 별도 보관. */
export function generateShareToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface PhotoShareRow {
  id: string; targetType: string; targetId: string | null; title: string | null; message: string | null;
  hasPassword: boolean; allowDownload: boolean; allowOriginalDownload: boolean; allowZip: boolean; watermark: boolean;
  startsAt: string | null; expiresAt: string | null; status: string;
  createdBy: string | null; createdByName: string | null; createdAt: string;
  viewCount: number; downloadCount: number; lastAccessedAt: string | null;
}

function rowToShare(r: Record<string, unknown>): PhotoShareRow {
  return {
    id: r.id as string, targetType: r.target_type as string, targetId: r.target_id as string | null,
    title: r.title as string | null, message: r.message as string | null,
    hasPassword: !!r.password_hash,
    allowDownload: !!r.allow_download, allowOriginalDownload: !!r.allow_original_download,
    allowZip: !!r.allow_zip, watermark: !!r.watermark,
    startsAt: r.starts_at as string | null, expiresAt: r.expires_at as string | null, status: r.status as string,
    createdBy: r.created_by as string | null, createdByName: r.created_by_name as string | null, createdAt: r.created_at as string,
    viewCount: r.view_count as number, downloadCount: r.download_count as number, lastAccessedAt: r.last_accessed_at as string | null,
  };
}

export interface CreateShareInput {
  targetType: 'selection' | 'folder' | 'album';
  targetId?: string | null;
  photoIds?: string[];
  title?: string; message?: string; password?: string;
  allowDownload: boolean; allowOriginalDownload: boolean; allowZip: boolean; watermark: boolean;
  expiresInDays?: number | null;
}

/** 요청서 42~46번: 토큰+비밀번호+만료 외부 공유 생성. selection이면 photo_share_items에
 * 명시적으로 사진 목록을 담고(target_id 없음), folder/album이면 target_id만 저장하고
 * 실제 사진 목록은 접근 시점에 동적으로 계산한다(이후 추가된 사진도 자동 포함). */
export function createExternalShare(user: User, input: CreateShareInput): ShareResult<{ id: string; token: string }> {
  if (input.targetType === 'selection' && (!input.photoIds || input.photoIds.length === 0)) {
    return { ok: false, error: '공유할 사진을 선택하세요', status: 400 };
  }
  if ((input.targetType === 'folder' || input.targetType === 'album') && !input.targetId) {
    return { ok: false, error: 'targetId가 필요합니다', status: 400 };
  }
  // selection 공유는 사진별 접근 권한(업로더/공개/관리자)을 하나라도 만족 못하면 거절 — 남의 비공개 사진을 몰래 공유 링크로 뿌리는 것을 막는다.
  if (input.targetType === 'selection') {
    for (const photoId of input.photoIds!) {
      const photo = getPhotoById(photoId);
      if (!photo) return { ok: false, error: '존재하지 않는 사진이 포함되어 있습니다', status: 400 };
      const { ownerUserId } = getPhotoOwnership(photo);
      if (!canManageExternalShare(user, ownerUserId)) return { ok: false, error: '권한이 없는 사진이 포함되어 있습니다', status: 403 };
    }
  }

  const db = getDb();
  const id = newId();
  const token = generateShareToken();
  const ts = now();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString() : null;
  const pw = input.password ? hashSharePassword(input.password) : null;

  db.prepare(`INSERT INTO photo_shares
    (id, target_type, target_id, token_hash, token_encrypted, title, message, password_hash, password_salt,
     allow_download, allow_original_download, allow_zip, watermark, starts_at, expires_at, status,
     created_by, created_by_name, created_at, view_count, download_count)
    VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, 'active', ?,?,?, 0,0)`).run(
    id, input.targetType, input.targetId ?? null, hashShareToken(token), encryptPassword(token),
    input.title ?? null, input.message ?? null, pw?.hash ?? null, pw?.salt ?? null,
    input.allowDownload ? 1 : 0, input.allowOriginalDownload ? 1 : 0, input.allowZip ? 1 : 0, input.watermark ? 1 : 0,
    null, expiresAt, user.id, user.name, ts,
  );

  if (input.targetType === 'selection') {
    const insertItem = db.prepare(`INSERT OR IGNORE INTO photo_share_items (share_id, photo_id) VALUES (?,?)`);
    for (const photoId of input.photoIds!) insertItem.run(id, photoId);
  }

  writePhotoAuditLog({ userId: user.id, userName: user.name, action: 'SHARE_CREATED', after: { shareId: id, targetType: input.targetType, targetId: input.targetId, photoCount: input.photoIds?.length } });
  return { ok: true, data: { id, token } };
}

export function revokeExternalShare(user: User, shareId: string, reason?: string): ShareResult<null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_shares WHERE id=?`).get(shareId) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: 'not found', status: 404 };
  if (row.created_by !== user.id && !isPhotoAdmin(user)) return { ok: false, error: '권한이 없습니다', status: 403 };
  db.prepare(`UPDATE photo_shares SET status='revoked', revoked_at=?, revoked_by=?, revoked_reason=? WHERE id=?`)
    .run(now(), user.id, reason ?? null, shareId);
  writePhotoAuditLog({ userId: user.id, userName: user.name, action: 'SHARE_REVOKED', before: { shareId } });
  return { ok: true, data: null };
}

/** 관리자 "외부 공유 관리" 화면(요청서 47번) — 전체 목록. */
export function listAllExternalShares(): PhotoShareRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM photo_shares ORDER BY created_at DESC`).all() as Record<string, unknown>[];
  return rows.map(rowToShare);
}

export function listMyExternalShares(user: User): PhotoShareRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM photo_shares WHERE created_by=? ORDER BY created_at DESC`).all(user.id) as Record<string, unknown>[];
  return rows.map(rowToShare);
}

export function getShareToken(shareId: string): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT token_encrypted FROM photo_shares WHERE id=?`).get(shareId) as { token_encrypted: string | null } | undefined;
  if (!row?.token_encrypted) return null;
  try { return decryptPassword(row.token_encrypted); } catch { return null; }
}

export type ResolveResult =
  | { ok: true; share: PhotoShareRow; needsPassword: boolean }
  | { ok: false; status: number; error: string };

/** 공개 라우트 공통 진입점 — 토큰 유효성 + 만료 + 상태를 한 번에 검증. */
export function resolveShareByToken(token: string): ResolveResult {
  if (!token || token.length < 20) return { ok: false, status: 404, error: '유효하지 않은 링크입니다' };
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_shares WHERE token_hash=?`).get(hashShareToken(token)) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, status: 404, error: '유효하지 않은 링크입니다' };
  const share = rowToShare(row);
  if (share.status !== 'active') return { ok: false, status: 410, error: '폐기되었거나 만료된 링크입니다' };
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    db.prepare(`UPDATE photo_shares SET status='expired' WHERE id=?`).run(share.id);
    return { ok: false, status: 410, error: '만료된 링크입니다' };
  }
  return { ok: true, share, needsPassword: share.hasPassword };
}

export function checkSharePassword(shareId: string, password: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT password_hash, password_salt FROM photo_shares WHERE id=?`).get(shareId) as { password_hash: string | null; password_salt: string | null } | undefined;
  if (!row?.password_hash || !row.password_salt) return true;
  return verifySharePassword(password, row.password_hash, row.password_salt);
}

export interface SharedPhotoRow { id: string; originalFileName: string; title: string | null; status: string; width: number | null; height: number | null }

/** target_type에 따라 실제 노출할 사진 목록을 계산 — folder/album은 동적(요청서 43번:
 * "앨범/폴더 뒤에 추가된 사진도 자동 포함") 이지만 삭제된 사진은 제외. */
export function getSharedPhotos(share: PhotoShareRow): SharedPhotoRow[] {
  const db = getDb();
  let rows: Record<string, unknown>[];
  if (share.targetType === 'selection') {
    rows = db.prepare(`
      SELECT p.* FROM photo_share_items si JOIN photos p ON p.id = si.photo_id
      WHERE si.share_id = ? AND p.deleted_at IS NULL ORDER BY si.rowid
    `).all(share.id) as Record<string, unknown>[];
  } else if (share.targetType === 'folder') {
    rows = db.prepare(`SELECT * FROM photos WHERE folder_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC`).all(share.targetId) as Record<string, unknown>[];
  } else {
    rows = db.prepare(`
      SELECT p.* FROM photo_album_items ai JOIN photos p ON p.id = ai.photo_id
      WHERE ai.album_id = ? AND p.deleted_at IS NULL ORDER BY ai.added_at DESC
    `).all(share.targetId) as Record<string, unknown>[];
  }
  return rows.map(r => ({
    id: r.id as string, originalFileName: r.original_file_name as string, title: r.title as string | null,
    status: r.status as string, width: r.width as number | null, height: r.height as number | null,
  }));
}

function clientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export function recordShareAccess(shareId: string, action: 'view' | 'download' | 'zip' | 'password_fail', req?: NextRequest): void {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO photo_share_access_logs (id, share_id, action, ip_address, user_agent, created_at) VALUES (?,?,?,?,?,?)`)
      .run(newId(), shareId, action, clientIp(req), req?.headers.get('user-agent') ?? null, now());
    if (action === 'view') db.prepare(`UPDATE photo_shares SET view_count = view_count + 1, last_accessed_at=? WHERE id=?`).run(now(), shareId);
    else if (action === 'download' || action === 'zip') db.prepare(`UPDATE photo_shares SET download_count = download_count + 1, last_accessed_at=? WHERE id=?`).run(now(), shareId);
  } catch (e) {
    console.error('[share access log]', e);
  }
}

export function listShareAccessLogs(shareId: string): { action: string; ipAddress: string | null; createdAt: string }[] {
  const db = getDb();
  const rows = db.prepare(`SELECT action, ip_address, created_at FROM photo_share_access_logs WHERE share_id=? ORDER BY created_at DESC LIMIT 200`).all(shareId) as Record<string, unknown>[];
  return rows.map(r => ({ action: r.action as string, ipAddress: r.ip_address as string | null, createdAt: r.created_at as string }));
}

const UNLOCK_COOKIE_PREFIX = 'photo_share_unlock_';

/** 비밀번호 입력 후 "세션쿠키로 제한시간 유지"(요청서 44번) — 서버 상태 없이 HMAC 서명값을
 * 쿠키에 담아 검증만 하면 되므로 별도 세션 테이블이 필요 없다. */
export function signShareUnlock(shareId: string): string {
  const secret = process.env.AUTH_SECRET || 'tradeos-mail-default-key';
  return crypto.createHmac('sha256', secret).update(shareId).digest('hex');
}
export function shareUnlockCookieName(shareId: string): string {
  return UNLOCK_COOKIE_PREFIX + shareId;
}
export function verifyShareUnlockCookie(shareId: string, cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const expected = signShareUnlock(shareId);
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
