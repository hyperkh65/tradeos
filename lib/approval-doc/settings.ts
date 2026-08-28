import { getDb, now } from '@/lib/db/sqlite';

export interface ApprovalDocSettings {
  maxFileSizeMb: number;
  maxProjectTotalMb: number;
}

const DEFAULTS: ApprovalDocSettings = { maxFileSizeMb: 50, maxProjectTotalMb: 500 };
const KEY = 'approval_doc_settings';

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

export function getApprovalDocSettings(): ApprovalDocSettings {
  try {
    const db = getDb();
    ensureTable(db);
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(KEY) as { value: string } | undefined;
    if (!row) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULTS;
  }
}
