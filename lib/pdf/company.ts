import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db/sqlite';
import { DEFAULT_COMPANY } from '@/app/api/settings/company/route';

const COMPANY_UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/company'
  : path.join(process.cwd(), 'data/uploads/company');

export function getCompanySettings(): Record<string, string> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    const saved = row ? JSON.parse(row.value) : {};
    return { ...DEFAULT_COMPANY, ...saved };
  } catch {
    return DEFAULT_COMPANY;
  }
}

// company.stampUrl은 "/api/settings/company/upload/stamp.png?t=..." 형태 - 디스크 경로로 변환
export function resolveCompanyAssetPath(url: string | undefined): string | null {
  if (!url) return null;
  const filename = url.split('?')[0].split('/').filter(Boolean).pop();
  if (!filename) return null;
  const full = path.join(COMPANY_UPLOAD_BASE, filename);
  return fs.existsSync(full) ? full : null;
}
