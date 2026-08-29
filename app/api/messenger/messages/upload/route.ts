import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export const maxDuration = 120;

const UPLOAD_DIR = process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads'
    : path.join(process.cwd(), 'data', 'uploads'));

const MAX_SIZE = 200 * 1024 * 1024; // 200MB — 동영상 포함이라 다른 200MB 첨부 엔드포인트(검품/클레임)와 동일하게 맞춤

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10) || '.bin';
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
}

/** 메신저는 사진/그림/동영상/문서를 전부 첨부 대상으로 삼는다 — 특정 확장자만
 * 허용하는 화이트리스트를 두지 않는다(이 앱의 다른 업로드 엔드포인트들도 대부분
 * 확장자를 소독만 하고 종류를 제한하지 않는 방식이라 그 관례를 그대로 따름).
 * 화면에서 이미지/동영상/일반 파일 중 어떻게 보여줄지는 attachment_type(MIME)의
 * 접두사(image/, video/)로 클라이언트가 판단한다. */
export async function POST(req: NextRequest) {
  let filepath = '';
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }

    const formData = await req.formData();
    const channelId = formData.get('channelId') as string | null;
    const file = formData.get('file') as File | null;
    const content = (formData.get('content') as string | null)?.trim() || '';
    if (!channelId) return NextResponse.json({ error: 'channelId가 필요합니다' }, { status: 400 });
    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: '파일 크기는 200MB 이하로 업로드하세요' }, { status: 400 });

    const db = getDb();
    const channel = db.prepare('SELECT status FROM channels WHERE id=?').get(channelId) as { status: string } | undefined;
    if (!channel) return NextResponse.json({ error: '대화방을 찾을 수 없습니다.' }, { status: 404 });
    if (channel.status === 'deleted') return NextResponse.json({ error: '삭제된 대화방에는 메시지를 보낼 수 없습니다.' }, { status: 403 });

    const dir = path.join(UPLOAD_DIR, 'messenger', channelId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    const writeStream = fs.createWriteStream(filepath);
    await pipeline(nodeStream, writeStream);

    const url = `/api/uploads/messenger/${channelId}/${filename}`;
    const id = newId();
    const createdAt = now();
    db.prepare(`
      INSERT INTO messages (id, channel_id, sender_id, sender_name, content, created_at, attachment_url, attachment_name, attachment_type, attachment_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, channelId, user.id, user.name, content, createdAt, url, file.name, file.type || null, file.size);

    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error('[messenger upload]', e);
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
