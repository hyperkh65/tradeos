import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  db.prepare(`UPDATE hr SET name=?,name_en=?,department=?,position=?,join_date=?,phone=?,email=?,status=?,salary=?,memo=?,updated_at=? WHERE id=?`)
    .run(body.name, body.nameEn ?? null, body.department ?? null, body.position ?? null, body.joinDate ?? null, body.phone ?? null, body.email ?? null, body.status ?? 'active', body.salary ?? null, body.memo ?? null, now(), id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM hr WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
