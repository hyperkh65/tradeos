import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getAppRootDir } from '@/lib/db/backup';

export const maxDuration = 300;

const PLATFORMS = new Set(['windows', 'macos']);
const MAX_SIZE = 500 * 1024 * 1024; // 500MB — 서명 없는 지금도 수십MB 수준이지만 향후 여유

function releasesDir(platform: string): string {
  return path.join(getAppRootDir(), 'data', 'releases', platform);
}

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10) || '.bin';
  return `release_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const db = getDb();
  const rows = db.prepare('SELECT * FROM app_releases ORDER BY created_at DESC').all();
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  let filepath = '';
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const platform = (formData.get('platform') as string | null)?.trim() || '';
    const architecture = (formData.get('architecture') as string | null)?.trim() || '';
    const version = (formData.get('version') as string | null)?.trim() || '';
    const buildNumber = (formData.get('buildNumber') as string | null)?.trim() || null;
    const releaseNotes = (formData.get('releaseNotes') as string | null)?.trim() || null;
    const minimumOs = (formData.get('minimumOs') as string | null)?.trim() || null;

    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: '파일 크기가 너무 큽니다(500MB 이하)' }, { status: 400 });
    if (!PLATFORMS.has(platform)) return NextResponse.json({ error: 'platform은 windows 또는 macos여야 합니다.' }, { status: 400 });
    if (!architecture) return NextResponse.json({ error: 'architecture가 필요합니다.' }, { status: 400 });
    if (!version) return NextResponse.json({ error: 'version이 필요합니다.' }, { status: 400 });

    const dir = releasesDir(platform);
    fs.mkdirSync(dir, { recursive: true });
    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    const hash = crypto.createHash('sha256');
    const writeStream = fs.createWriteStream(filepath);
    nodeStream.on('data', (chunk) => hash.update(chunk));
    await pipeline(nodeStream, writeStream);
    const sha256 = hash.digest('hex');

    const db = getDb();
    const id = newId();
    const createdAt = now();
    db.prepare(`
      INSERT INTO app_releases
        (id, platform, architecture, version, build_number, file_name, file_path, file_size, sha256, release_notes, minimum_os, active, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, platform, architecture, version, buildNumber, file.name, filepath, file.size, sha256, releaseNotes, minimumOs, user.id, createdAt);

    const row = db.prepare('SELECT * FROM app_releases WHERE id = ?').get(id);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (e) {
    console.error('[app-releases upload]', e);
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
