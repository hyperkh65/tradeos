import type { User } from '@/types';

/**
 * Admin Tools Platform 권한 상수. 이 프로젝트는 별도 permissions 테이블/RBAC
 * 미들웨어가 없고(User.permissions는 admin만 ['*'], 나머지는 항상 []) 각 API
 * 라우트가 `user.role === 'admin'` 등을 인라인으로 체크하는 관례를 그대로 따른다.
 * 여기 3개 상수는 스펙이 요구한 이름(VIEW/USE/MANAGE)을 그대로 붙여두되, 지금은
 * 셋 다 "관리자인가"로만 판정한다 — 향후 진짜 세분화된 권한 부여 체계가 생기면
 * 이 이름들을 그대로 두고 판정 로직만 바꾸면 되게 하기 위함이지, 새 RBAC를
 * 도입하는 게 아니다.
 */
export const ADMIN_TOOLS_PERMISSIONS = {
  VIEW: 'ADMIN_TOOLS_VIEW',
  USE: 'ADMIN_TOOLS_USE',
  MANAGE: 'ADMIN_TOOLS_MANAGE',
} as const;

export function isAdminToolsAdmin(user: User): boolean {
  return user.role === 'admin';
}

export function canViewAdminTools(user: User): boolean {
  return isAdminToolsAdmin(user);
}

export function canUseAdminTools(user: User): boolean {
  return isAdminToolsAdmin(user);
}

export function canManageAdminTools(user: User): boolean {
  return isAdminToolsAdmin(user);
}
