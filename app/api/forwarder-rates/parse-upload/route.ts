import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseCncExcel } from '@/lib/forwarder-rates/parse-cnc-excel';
import { parseAncPdf, type BreakdownLookup } from '@/lib/forwarder-rates/parse-anc-pdf';

export const maxDuration = 60;

/** 업로드한 견적 파일(엑셀/PDF)을 파싱해서 붙여넣기 그리드와 같은 형태의 행 배열로
 * 돌려준다 — 절대 바로 저장하지 않는다(파싱 정확도 리스크를 사람이 확인하는 그리드로
 * 상쇄). 확장자로 CNC(엑셀)/ANC(PDF) 파서를 나눠 호출한다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const forwarderName = (formData.get('forwarderName') as string) || '';
  if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: '파일 크기는 20MB 이하로 업로드하세요' }, { status: 400 });

  const ext = file.name.toLowerCase().split('.').pop() || '';
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === 'xlsx' || ext === 'xls') {
      const { rows, warnings, sheetName } = await parseCncExcel(buf);
      return NextResponse.json({ data: rows, warnings: [...warnings, `참고: "${sheetName}" 시트를 읽었습니다.`] });
    }
    if (ext === 'pdf') {
      const db = getDb();
      const lookupBreakdown: BreakdownLookup = (pod, containerType) => {
        if (!forwarderName) return null;
        const row = db.prepare(`
          SELECT breakdown_json FROM forwarder_rates
          WHERE forwarder_name=? AND pod=? AND container_type=?
          ORDER BY COALESCE(quote_date, created_at) DESC, created_at DESC LIMIT 1
        `).get(forwarderName, pod, containerType) as { breakdown_json: string } | undefined;
        if (!row) return null;
        try {
          const items = JSON.parse(row.breakdown_json || '[]') as { label: string; amount: number; currency: string }[];
          return items.filter(i => i.currency === 'KRW');
        } catch { return null; }
      };
      const { rows, warnings } = await parseAncPdf(buf, lookupBreakdown);
      return NextResponse.json({ data: rows, warnings });
    }
    return NextResponse.json({ error: '지원하지 않는 파일 형식입니다(.xlsx, .xls, .pdf만 지원)' }, { status: 400 });
  } catch (e) {
    console.error('[forwarder-rates parse-upload]', e);
    return NextResponse.json({ error: `파일을 읽는 중 오류가 발생했습니다: ${(e as Error).message}` }, { status: 500 });
  }
}
