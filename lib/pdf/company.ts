import { getDb } from '@/lib/db/sqlite';
import { DEFAULT_COMPANY } from '@/app/api/settings/company/route';

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
