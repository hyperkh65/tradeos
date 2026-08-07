import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.SQLITE_DB_PATH ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/nexport.db'
    : path.join(process.cwd(), 'data', 'nexport.db'));

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      department TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      type TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '한국',
      email TEXT,
      phone TEXT,
      website TEXT,
      wechat TEXT,
      memo TEXT,
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      name_ko TEXT NOT NULL,
      name_en TEXT,
      category TEXT,
      supplier_id TEXT,
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      purchase_price REAL,
      selling_price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      moq INTEGER,
      lead_time_days INTEGER,
      hs_code TEXT,
      country_of_origin TEXT,
      net_weight REAL,
      gross_weight REAL,
      cbm REAL,
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      supplier_id TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      currency TEXT NOT NULL DEFAULT 'USD',
      total_amount REAL NOT NULL DEFAULT 0,
      deposit_amount REAL,
      balance_amount REAL,
      payment_terms TEXT,
      order_date TEXT NOT NULL,
      production_due_date TEXT,
      inspection_date TEXT,
      etd TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      incoterm TEXT,
      remark TEXT,
      created_by TEXT NOT NULL DEFAULT 'user-1',
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'customer',
      company_id TEXT,
      company_name TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      currency TEXT NOT NULL DEFAULT 'KRW',
      incoterm TEXT,
      payment_terms TEXT,
      validity TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      remark TEXT,
      created_by TEXT NOT NULL DEFAULT 'user-1',
      notion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      po_id TEXT NOT NULL,
      po_business_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      inspection_date TEXT NOT NULL,
      inspector TEXT,
      inspection_type TEXT NOT NULL DEFAULT '공장검품',
      sample_qty INTEGER NOT NULL DEFAULT 0,
      checked_qty INTEGER DEFAULT 0,
      passed_qty INTEGER DEFAULT 0,
      failed_qty INTEGER DEFAULT 0,
      defect_rate REAL,
      result TEXT NOT NULL DEFAULT 'PENDING',
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'LCL',
      forwarder_id TEXT,
      forwarder_name TEXT,
      origin TEXT,
      pol TEXT,
      pod TEXT,
      etd TEXT,
      eta TEXT,
      vessel TEXT,
      voyage TEXT,
      bl_no TEXT,
      cbm REAL,
      gross_weight REAL,
      po_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'booked',
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      shipment_id TEXT NOT NULL,
      shipment_business_id TEXT NOT NULL,
      broker_name TEXT,
      declaration_no TEXT,
      release_date TEXT,
      hs_code TEXT,
      duty_rate REAL,
      duty REAL,
      vat REAL,
      broker_fee REAL,
      fta_applicable INTEGER NOT NULL DEFAULT 0,
      co_status TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      notion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      customer_name TEXT,
      supplier_id TEXT,
      supplier_name TEXT,
      product_id TEXT,
      product_name TEXT,
      po_id TEXT,
      po_business_id TEXT,
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      claim_amount REAL,
      currency TEXT,
      compensation_type TEXT,
      compensation_amount REAL,
      status TEXT NOT NULL DEFAULT '접수',
      created_by TEXT NOT NULL DEFAULT 'user-1',
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KRW',
      exchange_rate REAL,
      amount_krw REAL,
      related_type TEXT,
      related_id TEXT,
      related_name TEXT,
      paid_date TEXT,
      invoice_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL DEFAULT 'user-1',
      notion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      owner_id TEXT NOT NULL DEFAULT 'user-1',
      owner_name TEXT NOT NULL DEFAULT '김대표',
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT '해야 함',
      related_type TEXT,
      related_id TEXT,
      related_name TEXT,
      notion_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}
