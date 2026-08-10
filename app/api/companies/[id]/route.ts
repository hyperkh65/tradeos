import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionPage, companyToNotion, archiveNotionPage } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE companies SET
      name=?, name_en=?, type=?, country=?, email=?, phone=?,
      website=?, wechat=?, memo=?,
      ceo=?, business_no=?, address=?, bank=?, account_no=?, trade_currency=?, contact_person=?,
      updated_at=?
      WHERE id=?`).run(
      body.name ?? row.name, body.nameEn ?? row.name_en, body.type ?? row.type,
      body.country ?? row.country, body.email ?? null, body.phone ?? null,
      body.website ?? null, body.wechat ?? null, body.memo ?? null,
      body.ceo ?? null, body.businessNo ?? null, body.address ?? null,
      body.bank ?? null, body.accountNo ?? null, body.currency ?? null,
      body.contactPerson ?? null,
      ts, id,
    );

    if (row.notion_id) {
      updateNotionPage(row.notion_id as string, companyToNotion(body)).catch(() => {});
    }

    const updated = db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({
      data: {
        id: updated.id, businessId: updated.business_id, name: updated.name,
        nameEn: updated.name_en || undefined, type: updated.type, country: updated.country,
        email: updated.email || undefined, phone: updated.phone || undefined,
        website: updated.website || undefined, wechat: updated.wechat || undefined,
        memo: updated.memo || undefined, ceo: updated.ceo || undefined,
        businessNo: updated.business_no || undefined, address: updated.address || undefined,
        bank: updated.bank || undefined, accountNo: updated.account_no || undefined,
        currency: updated.trade_currency || undefined, contactPerson: updated.contact_person || undefined,
        bizRegFile: updated.biz_reg_file || undefined, bankCopyFile: updated.bank_copy_file || undefined,
        createdAt: updated.created_at, updatedAt: updated.updated_at,
      }
    });
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
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
