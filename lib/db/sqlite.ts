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
  runMigrations(_db);
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
      code TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'personal',
      date TEXT NOT NULL,
      end_date TEXT,
      all_day INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      form_type TEXT NOT NULL,
      form_title TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_dept TEXT,
      steps_json TEXT NOT NULL DEFAULT '[]',
      current_step INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT '대기',
      description TEXT,
      body_html TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      related_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_attachments (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_comments (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'public',
      description TEXT,
      member_ids_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_ids_json TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      read_by_json TEXT NOT NULL DEFAULT '[]',
      starred_by_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'custom',
      label TEXT NOT NULL,
      email TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL DEFAULT 587,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_ext_messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      from_name TEXT,
      from_email TEXT NOT NULL DEFAULT '',
      to_json TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT,
      date TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      folder TEXT NOT NULL DEFAULT 'inbox',
      synced_at TEXT NOT NULL,
      UNIQUE(account_id, uid)
    );

    CREATE TABLE IF NOT EXISTS mail_contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, email)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      product_code TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '본사 창고',
      purchase_price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      memo TEXT,
      notion_id TEXT,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      sale_date TEXT NOT NULL,
      customer TEXT NOT NULL,
      sale_type TEXT NOT NULL DEFAULT '일반',
      salesperson TEXT,
      po_no TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      net_amount REAL NOT NULL DEFAULT 0,
      vat REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KRW',
      notion_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_ext_mails (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      cc TEXT NOT NULL DEFAULT '',
      bcc TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL DEFAULT '',
      attach_paths_json TEXT NOT NULL DEFAULT '[]',
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_msg TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function runMigrations(db: Database.Database) {
  const cols = [
    `ALTER TABLE approvals ADD COLUMN body_html TEXT`,
    `ALTER TABLE approvals ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`,
    `ALTER TABLE approvals ADD COLUMN due_date TEXT`,
    `ALTER TABLE approvals ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE approvals ADD COLUMN related_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE approvals ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE approvals ADD COLUMN requester_dept TEXT`,
    `ALTER TABLE mail_ext_messages ADD COLUMN folder TEXT NOT NULL DEFAULT 'inbox'`,
    `ALTER TABLE companies ADD COLUMN ceo TEXT`,
    `ALTER TABLE companies ADD COLUMN business_no TEXT`,
    `ALTER TABLE companies ADD COLUMN address TEXT`,
    `ALTER TABLE companies ADD COLUMN bank TEXT`,
    `ALTER TABLE companies ADD COLUMN account_no TEXT`,
    `ALTER TABLE companies ADD COLUMN trade_currency TEXT`,
    `ALTER TABLE companies ADD COLUMN contact_person TEXT`,
    `ALTER TABLE companies ADD COLUMN biz_reg_file TEXT`,
    `ALTER TABLE companies ADD COLUMN bank_copy_file TEXT`,
    `ALTER TABLE products ADD COLUMN image_url TEXT`,
    `ALTER TABLE products ADD COLUMN images_json TEXT`,
    `ALTER TABLE products ADD COLUMN detail TEXT`,
    `ALTER TABLE products ADD COLUMN voltage TEXT`,
    `ALTER TABLE products ADD COLUMN watts TEXT`,
    `ALTER TABLE products ADD COLUMN cct TEXT`,
    `ALTER TABLE products ADD COLUMN maker TEXT`,
    `ALTER TABLE products ADD COLUMN input_a TEXT`,
    `ALTER TABLE products ADD COLUMN output_v TEXT`,
    `ALTER TABLE products ADD COLUMN output_a TEXT`,
    `ALTER TABLE products ADD COLUMN material TEXT`,
    `ALTER TABLE products ADD COLUMN size_spec TEXT`,
    `ALTER TABLE products ADD COLUMN converter TEXT`,
    `ALTER TABLE quotes ADD COLUMN quote_date TEXT`,
    `ALTER TABLE quotes ADD COLUMN total_amount REAL DEFAULT 0`,
    `ALTER TABLE quotes ADD COLUMN updated_at TEXT`,
    `ALTER TABLE quotes ADD COLUMN updated_by TEXT`,
    `ALTER TABLE quotes ADD COLUMN images_json TEXT`,
    `ALTER TABLE quotes ADD COLUMN created_by_name TEXT`,
    `ALTER TABLE quotes ADD COLUMN history_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE quotes ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'QUOTE'`,
    `ALTER TABLE quotes ADD COLUMN special_notes TEXT`,
    `ALTER TABLE quotes ADD COLUMN general_info TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN images_json TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN deposit_ratio TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN revisions_json TEXT`,
    `ALTER TABLE sales ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`,
    `ALTER TABLE sales ADD COLUMN misc TEXT`,
    `ALTER TABLE sales ADD COLUMN supplier_id TEXT`,
    `ALTER TABLE sales ADD COLUMN supplier_name TEXT`,
    `ALTER TABLE sales ADD COLUMN po_id TEXT`,
    `ALTER TABLE sales ADD COLUMN po_business_id TEXT`,
    `ALTER TABLE inventory ADD COLUMN purchase_price REAL`,
    `ALTER TABLE inventory ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`,
    `ALTER TABLE inventory ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`,
    `ALTER TABLE inspections ADD COLUMN opinion TEXT`,
    `ALTER TABLE inspections ADD COLUMN report_files TEXT DEFAULT '[]'`,
    `ALTER TABLE inspections ADD COLUMN image_files TEXT DEFAULT '[]'`,
    `ALTER TABLE inspections ADD COLUMN product_name_manual TEXT`,
    `ALTER TABLE claims ADD COLUMN sale_id TEXT`,
    `ALTER TABLE claims ADD COLUMN sale_business_id TEXT`,
    `ALTER TABLE claims ADD COLUMN shipment_id TEXT`,
    `ALTER TABLE claims ADD COLUMN resolved_at TEXT`,
    `ALTER TABLE claims ADD COLUMN notion_id TEXT`,
    `ALTER TABLE claims ADD COLUMN image_files TEXT DEFAULT '[]'`,
    `ALTER TABLE claims ADD COLUMN report_files TEXT DEFAULT '[]'`,
  ];
  for (const sql of cols) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
  // Data migrations (idempotent)
  try { db.exec(`UPDATE purchase_orders SET currency='CNY' WHERE currency='RMB'`); } catch { /* ignore */ }
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}
