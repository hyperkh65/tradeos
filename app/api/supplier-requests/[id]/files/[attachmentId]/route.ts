import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/supplier-requests'
  : path.join(process.cwd(), 'data/uploads/supplier-requests');

/** 내부 담당자용 첨부파일 다운로드 — 프로젝트 생성자/admin이 아니어도 로그인한 그룹웨어
 * 사용자면 누구나 열람 가능(요청사항). 외부 공급업체용 라우트와 별개의 인증 경로. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id, attachmentId } = await params;
  const db = getDb();
  const att = db.prepare('SELECT * FROM supplier_attachments WHERE id=? AND project_id=?').get(attachmentId, id) as Record<string, unknown> | undefined;
  if (!att) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const filepath = path.join(UPLOAD_BASE, id, attachmentId, att.stored_filename as string);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일이 서버에 없습니다.' }, { status: 404 });

  const buf = fs.readFileSync(filepath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.original_filename as string)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
