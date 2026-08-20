import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  const db = getDb();
  const folders = db.prepare('SELECT * FROM file_folders ORDER BY is_system DESC, name ASC').all();
  return NextResponse.json({ data: folders });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: '폴더명 필수' }, { status: 400 });

  const db = getDb();
  const ts = now();
  const id = newId();
  db.prepare('INSERT INTO file_folders (id,name,parent_id,is_system,description,created_by,created_at,updated_at) VALUES (?,?,?,0,?,?,?,?)')
    .run(id, body.name.trim(), body.parent_id || null, body.description || null, user.name || user.email, ts, ts);

  const folder = db.prepare('SELECT * FROM file_folders WHERE id=?').get(id);
  return NextResponse.json({ data: folder }, { status: 201 });
}
