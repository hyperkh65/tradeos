import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getBackupConfig, saveBackupConfig } from '@/lib/db/backup';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: getBackupConfig() });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json();
  const cfg: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
  if (typeof body.includeFullApp === 'boolean') cfg.includeFullApp = body.includeFullApp;
  if (Number.isFinite(body.intervalHours) && body.intervalHours > 0) cfg.intervalHours = body.intervalHours;
  if (Number.isFinite(body.retainCount) && body.retainCount > 0) cfg.retainCount = Math.floor(body.retainCount);
  if (Number.isFinite(body.fullAppRetainCount) && body.fullAppRetainCount > 0) cfg.fullAppRetainCount = Math.floor(body.fullAppRetainCount);

  return NextResponse.json({ data: saveBackupConfig(cfg) });
}
