import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionPage, companyToNotion, archiveNotionPage } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Record<string,unknown>|undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE companies SET name=?,name_en=?,type=?,country=?,email=?,phone=?,website=?,wechat=?,memo=?,updated_at=? WHERE id=?`).run(
      body.name??row.name, body.nameEn??row.name_en, body.type??row.type,
      body.country??row.country, body.email??row.email, body.phone??row.phone,
      body.website??row.website, body.wechat??row.wechat, body.memo??row.memo,
      ts, id
    );

    if (row.notion_id) {
      updateNotionPage(row.notion_id as string, companyToNotion(body)).catch(() => {});
    }

    const updated = db.prepare('SELECT * FROM companies WHERE id=?').get(id);
    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT notion_id FROM companies WHERE id=?').get(id) as { notion_id: string } | undefined;
    db.prepare('DELETE FROM companies WHERE id=?').run(id);
    if (row?.notion_id) archiveNotionPage(row.notion_id).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
