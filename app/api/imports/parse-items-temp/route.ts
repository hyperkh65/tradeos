import { NextRequest } from 'next/server';
import { parseItemsFromFile } from '@/lib/import-parse-items';

export const maxDuration = 30;

// 신규 건(id 없음)에서 품목 엑셀 파싱용 임시 엔드포인트
// FormData: file, mode('sheets'|'parse'), sheet?
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: '파일 없음' }, { status: 400 });
  const mode = (formData.get('mode') as 'sheets' | 'parse') || 'parse';
  const sheet = formData.get('sheet') as string | undefined || undefined;
  return parseItemsFromFile(file, sheet, mode);
}
