import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/company'
  : path.join(process.cwd(), 'data/uploads/company');

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 회사정보를 수정할 수 있습니다.' }, { status: 403 });

  const formData = await req.formData();
  const type = formData.get('type') as string; // 'logo' | 'stamp'
  const file = formData.get('file') as File | null;

  if (!file || !['logo', 'stamp'].includes(type)) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  fs.mkdirSync(UPLOAD_BASE, { recursive: true });

  const ext = path.extname(file.name).toLowerCase() || '.png';
  const filename = `${type}${ext}`;
  const filePath = path.join(UPLOAD_BASE, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buf);

  const url = `/api/settings/company/upload/${filename}?t=${Date.now()}`;

  // Update company settings in DB
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
  const saved = row ? JSON.parse(row.value) : {};
  if (type === 'logo') saved.logoUrl = url;
  else saved.stampUrl = url;
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('company', JSON.stringify(saved), new Date().toISOString());

  return NextResponse.json({ url });
}
