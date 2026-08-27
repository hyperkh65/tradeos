import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { fetchNotionCompanies, createNotionCompany } from '@/lib/notion/mapper';
import { DEMO_COMPANIES } from '@/lib/demo-data';

function dbToCompany(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, name: row.name, nameEn: row.name_en || undefined,
    type: row.type, country: row.country, email: row.email || undefined, phone: row.phone || undefined,
    website: row.website || undefined, wechat: row.wechat || undefined, memo: row.memo || undefined,
    ceo: row.ceo || undefined, businessNo: row.business_no || undefined,
    address: row.address || undefined, bank: row.bank || undefined,
    accountNo: row.account_no || undefined, currency: row.trade_currency || undefined,
    contactPerson: row.contact_person || undefined,
    bizRegFile: row.biz_reg_file || undefined,
    bankCopyFile: row.bank_copy_file || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();

  // Sync from Notion (errors must not block SQLite fallback)
  try {
    const notionData = await fetchNotionCompanies();
    if (notionData.length > 0) {
      const insert = db.prepare(`INSERT INTO companies
        (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,
         ceo,business_no,address,bank,account_no,trade_currency,notion_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      // 앱에서 거래처를 새로 등록하면 SQLite에는 newId()로 만든 id가 이미 있고, 백그라운드로
      // Notion 페이지를 만든 뒤 그 notion_id만 나중에 연결한다(POST 라우트 참고). 그래서 이 동기화가
      // notion_id가 아니라 page.id(=Notion의 id)만으로 중복을 판단하면, 같은 회사인데 SQLite id가
      // 서로 달라 항상 "새 회사"로 오인해 매번 중복 행을 새로 만들어냈다(실제 운영 데이터에서 확인된
      // 버그: 동일 거래처가 서로 다른 코드로 2건씩 등록됨). notion_id로 먼저 매칭하고, 그것도 없으면
      // 이름+유형이 같은 기존 행(수기 등록분 포함)을 찾아 notion_id만 연결해준다.
      const byNotionId = db.prepare('SELECT id, notion_id FROM companies WHERE notion_id=?');
      const byNameType = db.prepare('SELECT id, notion_id FROM companies WHERE TRIM(LOWER(name))=TRIM(LOWER(?)) AND type=?');
      const linkNotionId = db.prepare('UPDATE companies SET notion_id=? WHERE id=?');
      const prefixMap: Record<string, string> = { '고객사':'CUS','공급업체':'SUP','포워더':'FWD','관세사':'BRK','기타':'ETC' };
      db.transaction(() => {
        for (const c of notionData) {
          if (byNotionId.get(c.id)) continue;
          const existing = byNameType.get(c.name, c.type) as { id: string; notion_id: string | null } | undefined;
          if (existing) {
            if (!existing.notion_id) linkNotionId.run(c.id, existing.id);
            continue;
          }
          const prefix = prefixMap[c.type] ?? 'ETC';
          const bizId = nextBizId(prefix, false);
          insert.run(c.id, bizId, c.name, c.nameEn ?? null, c.type, c.country,
            c.email ?? null, c.phone ?? null, c.website ?? null, c.wechat ?? null,
            c.memo ?? null, c.ceo ?? null, c.businessNo ?? null, c.address ?? null,
            c.bank ?? null, c.accountNo ?? null, c.currency ?? null,
            c.id, c.createdAt, c.updatedAt);
        }
      })();
    }
  } catch (e) {
    console.error('[API companies GET] Notion sync error:', e);
    // Fall through — return whatever is in SQLite
  }

  // Always read from SQLite
  try {
    const typeFilter = new URL(req.url).searchParams.get('type');
    const rows = typeFilter
      ? db.prepare('SELECT * FROM companies WHERE type = ? ORDER BY name ASC').all(typeFilter) as Record<string, unknown>[]
      : db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToCompany) });
  } catch (e) {
    console.error('[API companies GET] SQLite read error:', e);
  }

  return NextResponse.json({ data: DEMO_COMPANIES });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    // 같은 업체명+타입 중복 체크 (신규 등록 시만)
    if (!body.businessId) {
      const dup = db.prepare(
        "SELECT id, business_id FROM companies WHERE TRIM(LOWER(name)) = TRIM(LOWER(?)) AND type = ?"
      ).get(body.name?.trim(), body.type || '기타') as { id: string; business_id: string } | undefined;
      if (dup) {
        return NextResponse.json(
          { error: `동일한 업체명이 이미 등록되어 있습니다. (${dup.business_id})` },
          { status: 409 }
        );
      }
    }

    const id = body.preId || newId();
    const ts = now();
    const prefixMap: Record<string, string> = { '고객사':'CUS','공급업체':'SUP','포워더':'FWD','관세사':'BRK','기타':'ETC' };
    const typePrefix = prefixMap[body.type] ?? 'ETC';
    const bizId = body.businessId || nextBizId(typePrefix, false);

    db.prepare(`INSERT OR IGNORE INTO companies
      (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,
       ceo,business_no,address,bank,account_no,trade_currency,contact_person,
       notion_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, bizId, body.name, body.nameEn || null, body.type || '기타',
      body.country || '한국', body.email || null, body.phone || null,
      body.website || null, body.wechat || null, body.memo || null,
      body.ceo || null, body.businessNo || null, body.address || null,
      body.bank || null, body.accountNo || null, body.currency || null,
      body.contactPerson || null, null, ts, ts,
    );

    createNotionCompany({ id, businessId: bizId, name: body.name, nameEn: body.nameEn, type: body.type || '기타', country: body.country || '한국', email: body.email, phone: body.phone, website: body.website, wechat: body.wechat, memo: body.memo, createdAt: ts, updatedAt: ts } as any).then(notionId => {
      if (notionId) db.prepare('UPDATE companies SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch (e) {
    console.error('[API companies POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

