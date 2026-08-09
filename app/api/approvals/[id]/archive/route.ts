import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT archived FROM approvals WHERE id = ?').get(id) as { archived: number } | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const newArchived = row.archived ? 0 : 1;
  db.prepare('UPDATE approvals SET archived = ?, updated_at = ? WHERE id = ?').run(newArchived, now(), id);
  return NextResponse.json({ archived: newArchived });
}
