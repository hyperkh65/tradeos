import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasUpload } from '@/lib/storage/nas';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'tradeos-uploads');

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  const { uploadId, fileName, folderId, fileType, totalChunks, fileSize } = body as {
    uploadId: string; fileName: string; folderId: string | null;
    fileType: string; totalChunks: number; fileSize: number;
  };

  if (!uploadId || !fileName) return NextResponse.json({ error: '파라미터 오류' }, { status: 400 });

  const uploadDir = path.join(TEMP_DIR, uploadId);

  // 청크 파일 목록 확인
  const chunkFiles = fs.readdirSync(uploadDir)
    .filter(f => f.startsWith('chunk_'))
    .sort();

  if (chunkFiles.length !== totalChunks) {
    return NextResponse.json({ error: `청크 불일치: ${chunkFiles.length}/${totalChunks}` }, { status: 400 });
  }

  // 청크 합치기
  const parts: Buffer[] = chunkFiles.map(f => fs.readFileSync(path.join(uploadDir, f)));
  const merged = Buffer.concat(parts);

  // NAS에 저장
  const ts = now();
  const bizId = nextBizId('FILE');
  const safeName = fileName.replace(/[^a-zA-Z0-9가-힣._\-]/g, '_');
  const folderSlug = folderId || 'inbox';
  const remotePath = `files/${folderSlug}/${bizId}_${safeName}`;

  const result = await nasUpload(remotePath, merged, fileType || 'application/octet-stream');

  // 임시 파일 정리
  try { fs.rmSync(uploadDir, { recursive: true, force: true }); } catch { /* ignore */ }

  if (!result.success) {
    return NextResponse.json({ error: 'NAS 저장 실패: ' + result.error }, { status: 500 });
  }

  // DB 저장
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO file_items (id,business_id,folder_id,file_name,file_path,file_size,file_type,category,uploaded_by,uploaded_by_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, folderId || null, fileName, result.path!, fileSize || merged.length, fileType || '', '', user.name || user.email, user.id, ts, ts);

  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id);
  return NextResponse.json({ data: item }, { status: 201 });
}
