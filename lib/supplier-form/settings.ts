import { getDb, now } from '@/lib/db/sqlite';

export interface SupplierFormSettings {
  maxFileSizeMb: number;
  maxProjectTotalMb: number;
}

const DEFAULTS: SupplierFormSettings = { maxFileSizeMb: 30, maxProjectTotalMb: 300 };
const KEY = 'supplier_form_settings';

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

export function getSupplierFormSettings(): SupplierFormSettings {
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

export function saveSupplierFormSettings(patch: Partial<SupplierFormSettings>) {
  const db = getDb();
  ensureTable(db);
  const merged = { ...getSupplierFormSettings(), ...patch };
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)').run(KEY, JSON.stringify(merged), now());
  return merged;
}
