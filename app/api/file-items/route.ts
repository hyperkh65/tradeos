import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasUpload } from '@/lib/storage/nas';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  const search = searchParams.get('search');

  let q = 'SELECT f.*, ff.name as folder_name FROM file_items f LEFT JOIN file_folders ff ON f.folder_id=ff.id WHERE 1=1';
  const p: unknown[] = [];
  if (folderId === 'root') { q += ' AND f.folder_id IS NULL'; }
  else if (folderId) { q += ' AND f.folder_id=?'; p.push(folderId); }
  if (search) { q += ' AND (f.file_name LIKE ? OR f.category LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  q += ' ORDER BY f.created_at DESC';

  const items = db.prepare(q).all(...p);
  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const folderId = formData.get('folderId') as string || null;
  const category = formData.get('category') as string || '';

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ts = now();
  const bizId = nextBizId('FILE');
  const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._\-]/g, '_');

  // NAS 경로: files/[folderId or inbox]/[bizId]_[filename]
  const folderSlug = folderId || 'inbox';
  const remotePath = `files/${folderSlug}/${bizId}_${safeName}`;
  const result = await nasUpload(remotePath, buffer, file.type || 'application/octet-stream');
  if (!result.success) {
    return NextResponse.json({ error: 'NAS 저장 실패: ' + result.error }, { status: 500 });
  }

  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO file_items (id,business_id,folder_id,file_name,file_path,file_size,file_type,category,uploaded_by,uploaded_by_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, folderId || null, file.name, result.path!, file.size, file.type || '', category, user.name || user.email, user.id, ts, ts);

  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id);
  return NextResponse.json({ data: item }, { status: 201 });
}
