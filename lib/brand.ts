import { getDb } from './db/sqlite';

export interface BrandConfig {
  appName: string;
  logoText: string;
}

const DEFAULT_BRAND: BrandConfig = { appName: 'YNK 그룹웨어', logoText: 'YnK' };

function ensureSettingsTable(db: ReturnType<typeof getDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
}

export function getBrandConfig(): BrandConfig {
  try {
    const db = getDb();
    ensureSettingsTable(db);
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get('brand_config') as { value: string } | undefined;
    if (!row) return DEFAULT_BRAND;
    return { ...DEFAULT_BRAND, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function saveBrandConfig(cfg: Partial<BrandConfig>): BrandConfig {
  const db = getDb();
  ensureSettingsTable(db);
  const merged = { ...getBrandConfig(), ...cfg };
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
    .run('brand_config', JSON.stringify(merged), new Date().toISOString());
  return merged;
}
