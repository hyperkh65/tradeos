import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import Database from 'better-sqlite3';
import fs from 'fs';

// 구 ERP DB 후보 경로 (NAS 환경)
const CANDIDATE_PATHS = [
  process.env.OLD_ERP_DB_PATH,
  '/volume1/web/erp/data/nexport.db',
  '/volume1/web/ynk-erp/data/nexport.db',
  '/volume1/web/erp.ynk2014.com/data/nexport.db',
  '/volume1/web/old-erp/data/nexport.db',
].filter(Boolean) as string[];

function findOldDb(): string | null {
  for (const p of CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// GET: 구 ERP 사용자 목록 미리보기
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dbPath = searchParams.get('dbPath') || findOldDb();

    if (!dbPath) {
      return NextResponse.json({ error: '구 ERP DB 파일을 찾을 수 없습니다. dbPath 파라미터로 직접 경로를 지정하세요.', candidates: CANDIDATE_PATHS });
    }
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: `파일 없음: ${dbPath}` });
    }

    const oldDb = new Database(dbPath, { readonly: true });
    const rows = oldDb.prepare('SELECT id, email, name, role, department, status, created_at FROM users ORDER BY created_at ASC').all() as Array<{
      id: string; email: string; name: string; role: string; department: string | null; status: string; created_at: string;
    }>;
    oldDb.close();

    // 현재 DB에 이미 있는 이메일
    const currentDb = getDb();
    const existing = new Set((currentDb.prepare('SELECT email FROM users').all() as Array<{ email: string }>).map(r => r.email));

    return NextResponse.json({
      dbPath,
      users: rows.map(r => ({ ...r, alreadyExists: existing.has(r.email) })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: 선택한 사용자 가져오기 (비밀번호 해시 포함)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 });

    const body = await req.json();
    const { dbPath, userIds }: { dbPath: string; userIds: string[] } = body;

    if (!dbPath || !fs.existsSync(dbPath)) {
      return NextResponse.json({ error: '유효하지 않은 DB 경로' }, { status: 400 });
    }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds 필요' }, { status: 400 });
    }

    const oldDb = new Database(dbPath, { readonly: true });
    const placeholders = userIds.map(() => '?').join(',');
    const rows = oldDb.prepare(
      `SELECT id, email, name, password_hash, role, department, status, created_at FROM users WHERE id IN (${placeholders})`
    ).all(...userIds) as Array<{
      id: string; email: string; name: string; password_hash: string;
      role: string; department: string | null; status: string; created_at: string;
    }>;
    oldDb.close();

    const currentDb = getDb();
    const createdAt = now();
    let imported = 0;
    let skipped = 0;

    for (const r of rows) {
      const exists = currentDb.prepare('SELECT id FROM users WHERE email=?').get(r.email);
      if (exists) { skipped++; continue; }

      const id = newId();
      currentDb.prepare(
        `INSERT INTO users (id, email, name, password_hash, role, department, status, approved_by, approved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`
      ).run(id, r.email, r.name, r.password_hash, r.role ?? 'staff', r.department ?? null, user.id, createdAt, createdAt);
      imported++;
    }

    return NextResponse.json({ imported, skipped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
