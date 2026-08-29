/**
 * 도메인 의존 설정의 단일 진입점. 코드 곳곳에 도메인을 하드코딩하는 대신 이 함수를
 * 쓰면, 새 NAS로 복구하면서 도메인이 바뀌어도(recovery/change-domain.sh가 아래 env를
 * 갱신) 소스 코드를 한 곳도 손대지 않고 반영된다.
 */
export function getAppDomain(): string {
  return process.env.APP_DOMAIN || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'gw.ynk2014.com';
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || `https://${getAppDomain()}`;
}
