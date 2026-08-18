import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuf), {
      type: 'array',
      cellDates: false,
      raw: false,
      dense: false,
    });

    const sheetNames = wb.SheetNames;
    // 모든 시트 데이터 반환 (최대 5개 시트, 각 100행)
    const sheets = sheetNames.slice(0, 10).map(name => {
      const ws = wb.Sheets[name];
      // sheet_to_json으로 배열 형태 추출 (빈 셀 포함)
      const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: null,
        blankrows: true,
        raw: false,
      }) as (string | number | null)[][];

      // 최대 행폭 구하기
      const maxCols = rawRows.reduce((m, r) => Math.max(m, r.length), 0);

      // 의미있는 행만 (최대 80행, 빈 행 연속 3개 이상이면 중단)
      const rows: (string | number | null)[][] = [];
      let emptyCount = 0;
      for (const row of rawRows.slice(0, 80)) {
        const hasData = row.some(v => v !== null && v !== '' && v !== undefined);
        if (!hasData) { emptyCount++; if (emptyCount >= 3) break; }
        else emptyCount = 0;
        // 각 행을 maxCols 길이로 패딩
        const padded = [...row];
        while (padded.length < maxCols) padded.push(null);
        rows.push(padded);
      }

      return { name, rows, maxCols };
    });

    return NextResponse.json({ sheetNames, sheets });
  } catch (e) {
    console.error('[parse-file]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
