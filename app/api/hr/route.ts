import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getNotionClient, isDemoMode } from '@/lib/notion/client';

function dbToHr(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, nameEn: row.name_en || undefined,
    department: row.department, position: row.position,
    joinDate: row.join_date, phone: row.phone || undefined,
    email: row.email || undefined, status: row.status || 'active',
    salary: row.salary || undefined, memo: row.memo || undefined,
    notionId: row.notion_id || undefined, createdAt: row.created_at,
  };
}

async function fetchFromNotion() {
  const hrDbId = process.env.NOTION_DB_HR || '';
  if (!hrDbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({ database_id: hrDbId, page_size: 200,
      sorts: [{ property: 'Name', direction: 'ascending' }] });
    return res.results.filter(p => p.object === 'page').map((p: any) => {
      const props = p.properties;
      const getText = (...keys: string[]) => {
        for (const k of keys) {
          const v = props[k];
          if (!v) continue;
          const t = v.rich_text?.[0]?.plain_text || v.title?.[0]?.plain_text || v.email || '';
          if (t) return t;
        }
        return '';
      };
      const getNum = (...keys: string[]) => {
        for (const k of keys) { if (props[k]?.number != null) return props[k].number; }
        return undefined;
      };
      const getSel = (...keys: string[]) => {
        for (const k of keys) { const s = props[k]?.select?.name; if (s) return s; }
        return '';
      };
      const getDate = (...keys: string[]) => {
        for (const k of keys) { const d = props[k]?.date?.start; if (d) return d; }
        return '';
      };
      return {
        id: p.id, notionId: p.id,
        name: getText('Name', '이름', 'name'),
        nameEn: getText('NameEn', '영문명') || undefined,
        department: getText('Department', '부서', 'department'),
        position: getText('Position', '직위', '직책', 'Title'),
        joinDate: getDate('JoinDate', '입사일', 'StartDate'),
        phone: getText('Phone', '연락처', '핸드폰') || undefined,
        email: getText('Email', '이메일', 'email') || undefined,
        status: getSel('Status', '상태', 'Employment') || 'active',
        salary: getNum('Salary', '급여', 'Pay') || undefined,
        memo: getText('Memo', '메모', 'Note') || undefined,
        createdAt: new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error('[HR] Notion error:', e);
    return [];
  }
}

export async function GET() {
  const db = getDb();
  db.prepare(`CREATE TABLE IF NOT EXISTS hr (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT,
    department TEXT, position TEXT, join_date TEXT,
    phone TEXT, email TEXT, status TEXT DEFAULT 'active',
    salary REAL, memo TEXT, notion_id TEXT,
    created_at TEXT, updated_at TEXT
  )`).run();

  try {
    const notionHr = await fetchFromNotion();
    if (notionHr.length > 0) {
      db.transaction(() => {
        for (const h of notionHr) {
          db.prepare(`INSERT OR REPLACE INTO hr (id,name,name_en,department,position,join_date,phone,email,status,salary,memo,notion_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(h.id, h.name, h.nameEn ?? null, h.department, h.position, h.joinDate, h.phone ?? null, h.email ?? null, h.status, h.salary ?? null, h.memo ?? null, h.notionId ?? null, h.createdAt);
        }
      })();
      return NextResponse.json({ data: notionHr });
    }
  } catch (e) {
    console.error('[HR] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM hr ORDER BY name ASC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToHr) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  db.prepare(`CREATE TABLE IF NOT EXISTS hr (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT,
    department TEXT, position TEXT, join_date TEXT,
    phone TEXT, email TEXT, status TEXT DEFAULT 'active',
    salary REAL, memo TEXT, notion_id TEXT,
    created_at TEXT, updated_at TEXT
  )`).run();

  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO hr (id,name,name_en,department,position,join_date,phone,email,status,salary,memo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, body.name, body.nameEn ?? null, body.department ?? null, body.position ?? null, body.joinDate ?? null, body.phone ?? null, body.email ?? null, body.status ?? 'active', body.salary ?? null, body.memo ?? null, ts, ts);
  return NextResponse.json({ data: { id, ...body, createdAt: ts } }, { status: 201 });
}
