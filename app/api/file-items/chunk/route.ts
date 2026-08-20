import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'tradeos-uploads');

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const formData = await req.formData();
  const chunk = formData.get('chunk') as File | null;
  const uploadId = formData.get('uploadId') as string;
  const chunkIndex = Number(formData.get('chunkIndex'));

  if (!chunk || !uploadId) return NextResponse.json({ error: '파라미터 오류' }, { status: 400 });

  const uploadDir = path.join(TEMP_DIR, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });

  const chunkPath = path.join(uploadDir, `chunk_${String(chunkIndex).padStart(5, '0')}`);
  const buffer = Buffer.from(await chunk.arrayBuffer());
  fs.writeFileSync(chunkPath, buffer);

  return NextResponse.json({ ok: true, chunkIndex });
}
