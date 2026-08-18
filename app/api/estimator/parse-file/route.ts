import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export async function POST(req: NextRequest) {
  let tmpPath: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    tmpPath = join(tmpdir(), `est-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    await writeFile(tmpPath, Buffer.from(new Uint8Array(arrayBuf)));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpPath);

    const sheetNames = wb.worksheets.map(ws => ws.name);
    const sheetIdx = parseInt(formData.get('sheetIdx') as string || '0');
    const ws = wb.worksheets[sheetIdx] || wb.worksheets[0];

    const rows: (string | number | null)[][] = [];
    let maxCols = 0;

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum > 100) return;
      const rowData: (string | number | null)[] = [];
      let colCount = 0;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        colCount = colNum;
        let val: string | number | null = null;
        if (cell.value === null || cell.value === undefined) {
          val = null;
        } else if (typeof cell.value === 'object' && 'richText' in (cell.value as object)) {
          val = (cell.value as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('');
        } else if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
          val = (cell.value as ExcelJS.CellFormulaValue).result as number | string | null;
        } else if (typeof cell.value === 'object' && cell.value instanceof Date) {
          val = cell.value.toISOString().slice(0, 10);
        } else {
          val = cell.value as string | number;
        }
        rowData[colNum - 1] = val;
      });
      maxCols = Math.max(maxCols, colCount);
      // pad row
      while (rowData.length < maxCols) rowData.push(null);
      rows.push(rowData);
    });

    // Auto-detect column types using heuristics
    const colTypes: string[] = new Array(maxCols).fill('ignore');
    if (rows.length > 0) {
      // Check each column
      for (let c = 0; c < maxCols; c++) {
        const vals = rows.slice(0, 20).map(r => r[c]).filter(v => v !== null && v !== undefined);
        const strVals = vals.map(v => String(v).toLowerCase().trim());

        // Check header row (first non-empty)
        const header = String(rows[0]?.[c] || '').toLowerCase();

        if (/품명|제품명|name|item|model|모델/.test(header)) colTypes[c] = 'name';
        else if (/fob|가격|price|단가|unit price/.test(header)) colTypes[c] = 'fob';
        else if (/사이즈|size|carton|박스|box/.test(header)) colTypes[c] = 'size';
        else if (/입수|pcs|qty.per|per.box/.test(header)) colTypes[c] = 'qtyPerBox';
        else if (/통화|currency/.test(header)) colTypes[c] = 'currency';
        else {
          // numeric column that looks like price (1 < val < 1000)
          const nums = vals.slice(1).filter(v => typeof v === 'number') as number[];
          if (nums.length > 0) {
            const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
            if (avg > 0 && avg < 500) colTypes[c] = 'fob_candidate';
          }
          // size pattern detection
          const sizePattern = strVals.slice(1).some(v => /\d+[×x*]\d+[×x*]\d+/.test(v));
          if (sizePattern) colTypes[c] = 'size';
        }
      }
    }

    return NextResponse.json({
      sheetNames,
      currentSheet: ws.name,
      rows: rows.slice(0, 30),
      colTypes,
      totalRows: rows.length,
    });
  } catch (e) {
    console.error('[parse-file]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    if (tmpPath) await unlink(tmpPath).catch(() => {});
  }
}
