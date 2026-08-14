import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

export const DEFAULT_COMPANY: Record<string, string> = {
  name: '(주)와이엔케이',
  ceo: '유성택',
  bizNo: '131-86-67779',
  bizType: '도소매',
  bizItem: '상품중개업',
  address: '인천시 미추홀구 경인로 112 동양빌딩 4층',
  tel: '032-862-1350',
  fax: '032-863-1351',
  email: 'global@ynk2014.com',
  bank: '하나은행 904-910005-66704 (주)와이엔케이\n신한은행 140-013-060603 (주)와이엔케이',
  bankForeign1: 'SHINHAN BANK\n180-009-944500\nSWIFT CODE: SHBKKRSE\nYNK CO.,LTD',
  bankForeign2: '',
  logoUrl: '',
  stampUrl: '',
  ship24ApiKey: '',
  unipassApiKey: '',
  unipassApiKey2: '',
  unipassApiKey3: '',
};

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

export async function GET() {
  try {
    const db = getDb();
    ensureTable(db);
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    const saved = row ? JSON.parse(row.value) : {};
    return NextResponse.json({ data: { ...DEFAULT_COMPANY, ...saved } });
  } catch {
    return NextResponse.json({ data: DEFAULT_COMPANY });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    ensureTable(db);
    const body = await req.json();
    const ts = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('company', JSON.stringify(body), ts);
    return NextResponse.json({ data: body });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
