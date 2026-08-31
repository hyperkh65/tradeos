import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

const PLATFORMS = new Set(['windows', 'macos']);

// /install/windows, /install/macos 화면에서 쓴다 — 관리자 전용이 아니라 로그인한
// 모든 사용자가 볼 수 있어야 한다(다운로드 버튼도 마찬가지 원칙). file_path는
// 서버 로컬 경로라 노출하지 않는다.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const platform = req.nextUrl.searchParams.get('platform') || '';
  if (!PLATFORMS.has(platform)) return NextResponse.json({ error: 'platform은 windows 또는 macos여야 합니다.' }, { status: 400 });

  const db = getDb();
  const row = db.prepare(
    `SELECT id, platform, architecture, version, build_number, file_name, file_size, sha256, release_notes, minimum_os, created_at
     FROM app_releases WHERE platform=? AND active=1 ORDER BY created_at DESC LIMIT 1`
  ).get(platform);

  return NextResponse.json({ data: row || null });
}
