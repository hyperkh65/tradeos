import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const db = getDb();
  const rows = db.prepare(`
    SELECT qe.*, fi.file_name, fi.share_token, fi.id as file_item_id, fi.folder_id
    FROM quote_extractions qe
    JOIN file_items fi ON qe.file_id = fi.id
    WHERE qe.status = 'done'
    ORDER BY qe.created_at DESC
  `).all();

  return NextResponse.json({ data: rows });
}
