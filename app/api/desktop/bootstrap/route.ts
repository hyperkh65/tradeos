import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

// Tauri 데스크톱 셸이 시작할 때 조회하는 엔드포인트.
// 목적: 코드(Rust/설정파일)에 서버 도메인을 박아두지 않는 것 — 데스크톱 앱은 이 응답의
// serverUrl로만 창을 이동시키고, 그 값을 로컬에 "last-known-good"으로 캐싱한다.
// 앱은 최초 실행 시에만 하드코딩된 기본값(gw.ynk2014.com) 1곳으로 이 엔드포인트를 호출하고,
// 이후에는 캐싱된 URL로 호출한다 — 나중에 도메인이 바뀌어도 이 값만 갱신하면 기존 설치본이
// 재빌드 없이 새 도메인으로 넘어갈 수 있다. 데스크톱 쪽 검증/캐싱 구현은 Phase 7에서 완료.
//
// 로그인 전(창이 뜨기도 전) 호출되므로 인증 없이 허용한다 — middleware.ts PUBLIC_PATHS 참고.
// downloadUrl은 로그인이 필요한 다운로드 API를 그대로 가리킨다 — 이 값을 쓰는 화면
// (설정→업데이트 확인, /install/windows|macos)은 전부 로그인 후에만 보이므로 문제없다.
interface ReleaseInfo { latestVersion: string | null; downloadUrl: string | null }

function latestActiveRelease(platform: string): ReleaseInfo {
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, version FROM app_releases WHERE platform=? AND active=1 ORDER BY created_at DESC LIMIT 1`
    ).get(platform) as { id: string; version: string } | undefined;
    if (!row) return { latestVersion: null, downloadUrl: null };
    return { latestVersion: row.version, downloadUrl: `/api/settings/app-releases/${row.id}/download` };
  } catch {
    return { latestVersion: null, downloadUrl: null };
  }
}

export async function GET() {
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gw.ynk2014.com';

  return NextResponse.json({
    serverUrl,
    releases: {
      windows: latestActiveRelease('windows'),
      macos: latestActiveRelease('macos'),
    },
  });
}
