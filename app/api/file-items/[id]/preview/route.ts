import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDownload } from '@/lib/storage/nas';
import * as XLSX from 'xlsx';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  const fileName = (item.file_name as string) || '';
  const isExcel = /\.(xlsx?|csv)$/i.test(fileName) || (item.file_type as string)?.includes('sheet');
  if (!isExcel) return NextResponse.json({ error: 'Excel/CSV 파일만 미리보기 가능합니다.' }, { status: 400 });

  const buffer = await nasDownload(item.file_path as string);
  if (!buffer) return NextResponse.json({ error: '파일을 불러올 수 없습니다.' }, { status: 502 });

  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: false, cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // 전체 범위 파악
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const totalRows = range.e.r + 1;
  const totalCols = range.e.c + 1;

  // 첫 20행 추출 (빈 셀은 '' 로)
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: false,
  }) as (string | number | null)[][];

  const preview = rows.slice(0, 20).map(row => {
    const padded = [...row];
    while (padded.length < totalCols) padded.push(null);
    return padded;
  });

  // 열 머리글 생성 (A, B, C... 또는 AA, AB...)
  const colHeaders = Array.from({ length: totalCols }, (_, i) => XLSX.utils.encode_col(i));

  return NextResponse.json({ sheetName, colHeaders, preview, totalRows, totalCols });
}
