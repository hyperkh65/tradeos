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
  _db.pragma('synchronous = NORMAL');   // WAL 모드에서 충분한 내구성 유지하며 속도 향상
  _db.pragma('cache_size = -32000');    // 32MB 페이지 캐시 (기본 2MB)
  _db.pragma('mmap_size = 268435456'); // 256MB mmap I/O
  _db.pragma('temp_store = MEMORY');   // 임시 테이블 메모리 저장
  _db.pragma('busy_timeout = 5000');   // 잠금 대기 5초
  initSchema(_db);
  runMigrations(_db);
  ensureIndexes(_db);
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

    CREATE TABLE IF NOT EXISTS biz_sequences (
      prefix TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      last_num INTEGER NOT NULL DEFAULT 0
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
    `ALTER TABLE purchase_orders ADD COLUMN pi_number TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN pi_file_url TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN pi_stamped_url TEXT`,
    `ALTER TABLE shipments ADD COLUMN cargo_items_json TEXT DEFAULT '[]'`,
    `ALTER TABLE shipments ADD COLUMN container_no TEXT`,
    `ALTER TABLE shipments ADD COLUMN freight_cost REAL`,
    `ALTER TABLE shipments ADD COLUMN freight_currency TEXT DEFAULT 'USD'`,
    `ALTER TABLE shipments ADD COLUMN packing_list_url TEXT`,
    `ALTER TABLE shipments ADD COLUMN documents_json TEXT DEFAULT '[]'`,
    `ALTER TABLE shipments ADD COLUMN local_deleted INTEGER NOT NULL DEFAULT 0`,
    // imports 확장
    `ALTER TABLE imports ADD COLUMN updated_at TEXT`,
    `ALTER TABLE imports ADD COLUMN local_deleted INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE imports ADD COLUMN arrival_date TEXT`,
    `ALTER TABLE imports ADD COLUMN declaration_date TEXT`,
    `ALTER TABLE imports ADD COLUMN tax_payment_date TEXT`,
    `ALTER TABLE imports ADD COLUMN invoice_value REAL`,
    `ALTER TABLE imports ADD COLUMN invoice_currency TEXT DEFAULT 'USD'`,
    `ALTER TABLE imports ADD COLUMN exchange_rate REAL`,
    `ALTER TABLE imports ADD COLUMN freight_krw REAL`,
    `ALTER TABLE imports ADD COLUMN insurance_krw REAL`,
    `ALTER TABLE imports ADD COLUMN customs_value REAL`,
    `ALTER TABLE imports ADD COLUMN fta_type TEXT`,
    `ALTER TABLE imports ADD COLUMN co_no TEXT`,
    `ALTER TABLE imports ADD COLUMN inspection_type TEXT DEFAULT 'none'`,
    `ALTER TABLE imports ADD COLUMN items_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN documents_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN remark TEXT`,
    `ALTER TABLE imports ADD COLUMN freight_usd REAL`,
    `ALTER TABLE imports ADD COLUMN freight_exchange_rate REAL`,
    `ALTER TABLE imports ADD COLUMN inspection_fee REAL`,
    `ALTER TABLE imports ADD COLUMN warehouse_fee REAL`,
    `ALTER TABLE imports ADD COLUMN inland_freight REAL`,
    `ALTER TABLE imports ADD COLUMN refund_amount REAL`,
    `ALTER TABLE imports ADD COLUMN refund_status TEXT DEFAULT '없음'`,
    `ALTER TABLE imports ADD COLUMN detention_fee REAL`,
    `ALTER TABLE imports ADD COLUMN inland_freight_region TEXT`,
    `ALTER TABLE imports ADD COLUMN custom_costs_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN demurrage REAL`,
    `ALTER TABLE imports ADD COLUMN inland_carrier_id TEXT`,
    `ALTER TABLE imports ADD COLUMN inland_carrier_name TEXT`,
    `ALTER TABLE imports ADD COLUMN inspection_refund REAL`,
    `ALTER TABLE imports ADD COLUMN bl_no TEXT`,
    `ALTER TABLE imports ADD COLUMN settlement_status TEXT DEFAULT 'open'`,
    `ALTER TABLE imports ADD COLUMN settlement_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN settlement_history_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN closed_at TEXT`,
    `ALTER TABLE imports ADD COLUMN closed_by TEXT`,
    // cost_records 확장
    `ALTER TABLE expenses ADD COLUMN cost_record_id TEXT`,
  ];
  for (const sql of cols) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // 비용 원장 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cost_records (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      cost_type TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      shipment_id TEXT,
      shipment_business_id TEXT,
      import_id TEXT,
      import_business_id TEXT,
      po_id TEXT,
      po_business_id TEXT,
      client_id TEXT,
      client_name TEXT,
      cost_amount REAL NOT NULL,
      cost_currency TEXT NOT NULL DEFAULT 'KRW',
      fx_rate_at_cost REAL DEFAULT 1,
      cost_amount_krw REAL,
      incurred_date TEXT,
      disposition TEXT NOT NULL DEFAULT 'pending',
      bill_amount REAL,
      bill_currency TEXT DEFAULT 'KRW',
      bill_status TEXT DEFAULT 'unbilled',
      fx_rate_at_settle REAL,
      fx_gain_loss REAL,
      settled_at TEXT,
      linked_invoice_id TEXT,
      linked_sale_id TEXT,
      linked_expense_id TEXT,
      cause_type TEXT DEFAULT 'schedule',
      offset_status TEXT DEFAULT 'none',
      offset_remaining REAL,
      offset_po_id TEXT,
      allocation_group_id TEXT,
      allocation_method TEXT,
      allocation_ratio REAL,
      is_auto_allocated INTEGER DEFAULT 0,
      remark TEXT,
      created_by TEXT DEFAULT 'user-1',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`);
  } catch { /* already exists */ }

  // 외화 인보이스 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS foreign_invoices (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      client_id TEXT,
      client_name TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      items_json TEXT DEFAULT '[]',
      issued_date TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      fx_rate_at_payment REAL,
      paid_amount_krw REAL,
      paid_at TEXT,
      remark TEXT,
      created_by TEXT DEFAULT 'user-1',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`);
  } catch { /* already exists */ }
  // cost_records 컬럼 확장 (idempotent)
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN offset_items_json TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN company_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN line_items_json TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN files_json TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN notion_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN vendor_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN vendor_name TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN cost_items_json TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN linked_sales_json TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN paid_amount_krw REAL`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN payment_memo TEXT`); } catch { /* already exists */ }
  // foreign_invoices 컬럼 확장
  try { db.exec(`ALTER TABLE foreign_invoices ADD COLUMN vat_amount REAL DEFAULT 0`); } catch { /* already exists */ }

  // 원가계산기 케이스 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS estimator_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      container_type TEXT NOT NULL DEFAULT '40ft',
      freight_sea INTEGER NOT NULL DEFAULT 930000,
      freight_inland INTEGER NOT NULL DEFAULT 250000,
      freight_port INTEGER NOT NULL DEFAULT 280000,
      freight_misc INTEGER NOT NULL DEFAULT 0,
      fx_usd INTEGER NOT NULL DEFAULT 1330,
      fx_rmb INTEGER NOT NULL DEFAULT 185,
      duty_rate REAL NOT NULL DEFAULT 0.024,
      sim_mode TEXT NOT NULL DEFAULT 'standard',
      items_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }
  // estimator_cases 컬럼 추가 (마이그레이션)
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN freight_sea_usd REAL`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN epr_rate REAL NOT NULL DEFAULT 0`); } catch {}

  // Data migrations (idempotent)
  try { db.exec(`UPDATE purchase_orders SET currency='CNY' WHERE currency='RMB'`); } catch { /* ignore */ }

  // Dedup: keep only the row with shortest id (local id) per business_id, for products and quotes
  // This cleans up duplicates created by Notion sync bug (Notion page id vs local id)
  try {
    db.exec(`
      DELETE FROM products WHERE id IN (
        SELECT id FROM (
          SELECT id, business_id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY length(id) ASC, created_at ASC) AS rn
          FROM products
        ) WHERE rn > 1
      )
    `);
  } catch { /* ignore if ROW_NUMBER not supported */ }
  try {
    db.exec(`
      DELETE FROM quotes WHERE id IN (
        SELECT id FROM (
          SELECT id, business_id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY length(id) ASC, created_at ASC) AS rn
          FROM quotes
        ) WHERE rn > 1
      )
    `);
  } catch { /* ignore */ }
}

function ensureIndexes(db: Database.Database) {
  const idxList = [
    // 삭제 필터 (거의 모든 SELECT에 local_deleted=0 조건 있음)
    `CREATE INDEX IF NOT EXISTS idx_imports_deleted     ON imports(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_deleted   ON shipments(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_deleted    ON expenses(related_type, related_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_deleted       ON tasks(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_type      ON companies(local_deleted, type)`,
    `CREATE INDEX IF NOT EXISTS idx_products_deleted    ON products(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_pos_deleted         ON purchase_orders(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_quotes_deleted      ON quotes(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_claims_deleted      ON claims(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_inspections_deleted ON inspections(local_deleted, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_deleted       ON sales(local_deleted, created_at DESC)`,
    // bizId 검색 (연동 시 업체명/번호로 조회)
    `CREATE INDEX IF NOT EXISTS idx_shipments_bizid     ON shipments(business_id)`,
    `CREATE INDEX IF NOT EXISTS idx_imports_shipment    ON imports(shipment_id, shipment_business_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_related    ON expenses(related_type, related_id)`,
  ];
  for (const sql of idxList) {
    try { db.exec(sql); } catch { /* ignore */ }
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}

// Thread-safe sequential business ID generator using DB sequences table.
// Uses a transaction so concurrent requests never produce duplicate IDs.
// withYear=false: generates PREFIX-0001 (for companies); default true: PREFIX-YYYY-0001
export function nextBizId(prefix: string, withYear = true): string {
  const db = getDb();
  const year = new Date().getFullYear();
  const gen = db.transaction(() => {
    const row = db.prepare('SELECT last_num, year FROM biz_sequences WHERE prefix=?').get(prefix) as { last_num: number; year: number } | undefined;
    let num: number;
    if (!row || (withYear && row.year !== year)) {
      num = 1;
      db.prepare('INSERT OR REPLACE INTO biz_sequences (prefix, year, last_num) VALUES (?,?,?)').run(prefix, year, 1);
    } else {
      num = (row.last_num || 0) + 1;
      db.prepare('UPDATE biz_sequences SET last_num=? WHERE prefix=?').run(num, prefix);
    }
    return withYear
      ? `${prefix}-${year}-${String(num).padStart(4, '0')}`
      : `${prefix}-${String(num).padStart(4, '0')}`;
  });
  return gen() as string;
}
