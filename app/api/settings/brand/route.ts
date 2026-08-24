import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getBrandConfig, saveBrandConfig } from '@/lib/brand';

// 로그인 전 화면(로그인/회원가입)에서도 표시해야 하므로 조회는 인증 없이 허용한다.
export async function GET() {
  return NextResponse.json({ data: getBrandConfig() });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json();
  const cfg: Record<string, unknown> = {};
  if (typeof body.appName === 'string' && body.appName.trim()) cfg.appName = body.appName.trim();
  if (typeof body.logoText === 'string' && body.logoText.trim()) cfg.logoText = body.logoText.trim();

  return NextResponse.json({ data: saveBrandConfig(cfg) });
}
