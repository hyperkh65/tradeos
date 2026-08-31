import type { User } from '@/types';

/**
 * 사진첩 권한 상수. 이 프로젝트는 별도 permissions 테이블/RBAC 미들웨어가 없고
 * (User.permissions는 admin만 ['*'], 나머지는 항상 []) 각 API 라우트가
 * `user.role === 'admin'` 등을 인라인으로 체크하는 관례를 그대로 따른다.
 * 여기 상수는 그 인라인 체크를 함수로 이름 붙여 재사용하기 위함이지, 새로운
 * DB 기반 RBAC를 도입하는 게 아니다.
 */
export const PHOTO_PERMISSIONS = {
  VIEW: 'PHOTO_VIEW',
  UPLOAD: 'PHOTO_UPLOAD',
  EDIT: 'PHOTO_EDIT',
  DELETE: 'PHOTO_DELETE',
  SHARE_INTERNAL: 'PHOTO_SHARE_INTERNAL',
  SHARE_EXTERNAL: 'PHOTO_SHARE_EXTERNAL',
  DOWNLOAD_ORIGINAL: 'PHOTO_DOWNLOAD_ORIGINAL',
  MANAGE: 'PHOTO_MANAGE',
  PERMANENT_DELETE: 'PHOTO_PERMANENT_DELETE',
} as const;

export function isPhotoAdmin(user: User): boolean {
  return user.role === 'admin';
}

/** 폴더/앨범/사진에 view 권한이 있는가 — 공개(is_public) 또는 본인 소유 또는 관리자.
 *  내부공유 grant는 Phase 10에서 photo_internal_shares 조회를 추가로 결합한다. */
export function canViewOwned(user: User, ownerUserId: string | null, isPublic: boolean): boolean {
  if (isPhotoAdmin(user)) return true;
  if (isPublic) return true;
  return ownerUserId === user.id;
}

/** 수정/삭제(soft) 권한 — 업로더/소유자 본인 또는 관리자. */
export function canEditOwned(user: User, ownerUserId: string | null): boolean {
  return isPhotoAdmin(user) || ownerUserId === user.id;
}

/** 영구삭제 — 관리자만. 요청서 44번: 위험한 작업이라 권한+확인을 요구. */
export function canPermanentlyDelete(user: User): boolean {
  return isPhotoAdmin(user);
}

/** 외부 공유 생성/폐기 — 업로더/소유자 본인 또는 관리자(approval-doc 링크 생성 패턴과 동일). */
export function canManageExternalShare(user: User, ownerUserId: string | null): boolean {
  return isPhotoAdmin(user) || ownerUserId === user.id;
}

/** 사진첩 관리자 설정(제한값/정책) 변경 — 관리자만. */
export function canManageSettings(user: User): boolean {
  return isPhotoAdmin(user);
}
