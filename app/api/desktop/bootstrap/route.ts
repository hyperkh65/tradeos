import { NextResponse } from 'next/server';

// Tauri 데스크톱 셸이 시작할 때 조회하는 엔드포인트.
// 목적: 코드(Rust/설정파일)에 서버 도메인을 박아두지 않는 것 — 데스크톱 앱은 이 응답의
// serverUrl로만 창을 이동시키고, 그 값을 로컬에 "last-known-good"으로 캐싱한다.
// 앱은 최초 실행 시에만 하드코딩된 기본값(gw.ynk2014.com) 1곳으로 이 엔드포인트를 호출하고,
// 이후에는 캐싱된 URL로 호출한다 — 나중에 도메인이 바뀌어도 이 값만 갱신하면 기존 설치본이
// 재빌드 없이 새 도메인으로 넘어갈 수 있다. 데스크톱 쪽 검증/캐싱 구현은 Phase 7에서 진행.
//
// 로그인 전(창이 뜨기도 전) 호출되므로 인증 없이 허용한다 — middleware.ts PUBLIC_PATHS 참고.
export async function GET() {
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gw.ynk2014.com';

  return NextResponse.json({
    serverUrl,
    // Phase 10(NAS Release 저장소 + app_releases 테이블)에서 채워진다.
    // 데스크톱 빌드 자체가 아직 없으므로 지금은 정직하게 null로 응답한다.
    releases: {
      windows: { latestVersion: null, downloadUrl: null },
      macos: { latestVersion: null, downloadUrl: null },
    },
  });
}
