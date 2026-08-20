import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDownload } from '@/lib/storage/nas';
import * as XLSX from 'xlsx';

// 열 인덱스(0-based)로 셀값 안전하게 읽기
function cellVal(row: (string | number | null)[], idx: number | null | undefined): string {
  if (idx === null || idx === undefined || idx < 0) return '';
  const v = row[idx];
  return v === null || v === undefined ? '' : String(v).trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // 필수: nameCol (0-based 열 인덱스)
  const { nameCol, specCol, priceCol, startRow = 1 } = body as {
    nameCol: number;
    specCol?: number | null;
    priceCol?: number | null;
    startRow?: number;
  };

  if (typeof nameCol !== 'number') {
    return NextResponse.json({ error: '제품명 열(nameCol)은 필수입니다.' }, { status: 400 });
  }

  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  const buffer = await nasDownload(item.file_path as string);
  if (!buffer) return NextResponse.json({ error: '파일을 불러올 수 없습니다.' }, { status: 502 });

  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: false, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, defval: null, blankrows: false, raw: false,
  }) as (string | number | null)[][];

  // startRow(1-based) 이후부터 파싱
  const dataRows = rows.slice(startRow);

  const items = dataRows
    .map(row => ({
      name: cellVal(row, nameCol),
      spec: cellVal(row, specCol ?? null),
      price: cellVal(row, priceCol ?? null),
    }))
    .filter(r => r.name); // 제품명 없는 행 제외

  const ts = now();
  const existing = db.prepare('SELECT id FROM quote_extractions WHERE file_id=?').get(id) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE quote_extractions SET items_json=?,status=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(items), 'done', ts, existing.id);
  } else {
    db.prepare('INSERT INTO quote_extractions (id,file_id,items_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(newId(), id, JSON.stringify(items), 'done', ts, ts);
  }

  const result = db.prepare('SELECT * FROM quote_extractions WHERE file_id=?').get(id);
  return NextResponse.json({ data: result, count: items.length });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  return NextResponse.json({ data: db.prepare('SELECT * FROM quote_extractions WHERE file_id=?').get(id) });
}
