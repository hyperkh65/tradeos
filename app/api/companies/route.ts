import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionCompanies, createNotionCompany } from '@/lib/notion/mapper';
import { DEMO_COMPANIES } from '@/lib/demo-data';

export async function GET() {
  try {
    const db = getDb();

    // Try Notion first
    const notionData = await fetchNotionCompanies();
    if (notionData.length > 0) {
      // Sync to SQLite
      const upsert = db.prepare(`
        INSERT OR REPLACE INTO companies
        (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,notion_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const syncAll = db.transaction(() => {
        for (const c of notionData) {
          upsert.run(c.id,c.businessId,c.name,c.nameEn??null,c.type,c.country,c.email??null,c.phone??null,c.website??null,c.wechat??null,c.memo??null,c.id,c.createdAt,c.updatedAt);
        }
      });
      syncAll();
      return NextResponse.json({ data: notionData });
    }

    // Fall back to SQLite
    const rows = db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) {
      return NextResponse.json({ data: rows.map(dbToCompany) });
    }

    // Seed with demo data on first run
    const seed = db.prepare(`
      INSERT OR IGNORE INTO companies
      (id,business_id,name,name_en,type,country,email,phone,wechat,memo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const seedAll = db.transaction(() => {
      for (const c of DEMO_COMPANIES) {
        seed.run(c.id,c.businessId,c.name,c.nameEn??null,c.type,c.country,c.email??null,c.phone??null,c.wechat??null,c.memo??null,c.createdAt,c.updatedAt);
      }
    });
    seedAll();
    return NextResponse.json({ data: DEMO_COMPANIES });
  } catch (e) {
    console.error('[API companies GET]', e);
    return NextResponse.json({ data: DEMO_COMPANIES });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();
    const bizId = body.businessId || await nextBizId(db, 'CUS');

    const company = {
      id, businessId: bizId,
      name: body.name, nameEn: body.nameEn||null, type: body.type||'기타',
      country: body.country||'한국', email: body.email||null, phone: body.phone||null,
      website: body.website||null, wechat: body.wechat||null, memo: body.memo||null,
      notionId: null as string|null, createdAt: ts, updatedAt: ts,
    };

    db.prepare(`INSERT INTO companies (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,notion_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,bizId,company.name,company.nameEn,company.type,company.country,company.email,company.phone,company.website,company.wechat,company.memo,null,ts,ts
    );

    // Sync to Notion in background
    createNotionCompany(company).then(notionId => {
      if (notionId) db.prepare('UPDATE companies SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { ...company, businessId: bizId } }, { status: 201 });
  } catch (e) {
    console.error('[API companies POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

function dbToCompany(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, name: row.name, nameEn: row.name_en||undefined,
    type: row.type, country: row.country, email: row.email||undefined, phone: row.phone||undefined,
    website: row.website||undefined, wechat: row.wechat||undefined, memo: row.memo||undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function nextBizId(db: Database.Database, prefix: string): Promise<string> {
  const row = db.prepare(`SELECT business_id FROM companies WHERE business_id LIKE '${prefix}-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
  const last = row ? parseInt(row.business_id.split('-')[1] || '0') : 0;
  return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}

import type Database from 'better-sqlite3';
