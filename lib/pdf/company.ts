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

// company.stampUrl/logoUrl은 외부 호스팅(Cloudinary 등) 절대 URL이거나,
// 예전 방식인 "/api/settings/company/upload/stamp.png?t=..." 로컬 경로일 수 있다.
export function resolveCompanyAssetPath(url: string | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // 외부 URL은 그대로 반환 (react-pdf가 직접 fetch)
  const filename = url.split('?')[0].split('/').filter(Boolean).pop();
  if (!filename) return null;
  const full = path.join(COMPANY_UPLOAD_BASE, filename);
  return fs.existsSync(full) ? full : null;
}
