import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const expiresInDays = body.expiresInDays || 30;

  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  db.prepare('UPDATE file_items SET share_token=?,share_expires_at=?,updated_at=? WHERE id=?')
    .run(token, expiresAt, now(), id);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.json({ token, url: `${baseUrl}/share/${token}`, expiresAt });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  db.prepare('UPDATE file_items SET share_token=NULL,share_expires_at=NULL,updated_at=? WHERE id=?').run(now(), id);
  return NextResponse.json({ success: true });
}
