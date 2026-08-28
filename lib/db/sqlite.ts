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

export function getDbPath(): string {
  return DB_PATH;
}

// 백업 복원 시 파일을 통째로 교체하기 전에 현재 연결을 닫는다.
// 다음 getDb() 호출에서 새 파일로 자동 재연결된다.
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
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
      from_email TEXT,
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
    `ALTER TABLE approvals ADD COLUMN notion_id TEXT`,
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
    // 오더 추적: 발주 건이 어느 고객사 주문을 채우기 위한 것인지 (PO 1건 = 고객사 1곳)
    `ALTER TABLE purchase_orders ADD COLUMN customer_id TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN customer_name TEXT`,
    // idx_pos_deleted 인덱스가 매 서버 시작마다 조용히 실패하던 문제 (컬럼 자체가 없었음)
    `ALTER TABLE purchase_orders ADD COLUMN local_deleted INTEGER NOT NULL DEFAULT 0`,
    // 백업 이력: DB만 백업한 건지, 프로그램 전체를 백업한 건지 구분
    `ALTER TABLE backup_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'db'`,
    // 입금 관리: 매출/커미션 1건에 여러 번(분할) 입금될 수 있어 리스트로 관리
    // {id, date, amount, accountId, files:[{url,filename,originalName,size}]}[]
    `ALTER TABLE sales ADD COLUMN deposits_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE commissions ADD COLUMN deposits_json TEXT NOT NULL DEFAULT '[]'`,
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
    // 운임 통화 + 포워더 부대비용
    `ALTER TABLE imports ADD COLUMN freight_currency TEXT DEFAULT 'USD'`,
    `ALTER TABLE imports ADD COLUMN freight_handling_json TEXT DEFAULT '[]'`,
    `ALTER TABLE imports ADD COLUMN freight_vat REAL DEFAULT 0`,
    // cost_records 확장
    `ALTER TABLE expenses ADD COLUMN cost_record_id TEXT`,
    // 수익분석: 두 환율 컬럼 추가
    `ALTER TABLE profit_analyses ADD COLUMN customs_ex_rate REAL DEFAULT 0`,
    `ALTER TABLE profit_analyses ADD COLUMN wire_ex_rate REAL DEFAULT 0`,
    // imports: 공급사명
    `ALTER TABLE imports ADD COLUMN supplier_name TEXT DEFAULT ''`,
    // 수익분석: 공급사/매출처/정산 필드
    `ALTER TABLE profit_analyses ADD COLUMN supplier_name TEXT DEFAULT ''`,
    `ALTER TABLE profit_analyses ADD COLUMN customer_name TEXT DEFAULT ''`,
    `ALTER TABLE profit_analyses ADD COLUMN advance_payment REAL DEFAULT 0`,
    `ALTER TABLE profit_analyses ADD COLUMN payment_amount REAL DEFAULT 0`,
    `ALTER TABLE profit_analyses ADD COLUMN actual_payment REAL DEFAULT 0`,
    // 비용항목별 VAT율 (0 또는 10)
    `ALTER TABLE imports ADD COLUMN broker_fee_vat_rate REAL DEFAULT 10`,
    `ALTER TABLE imports ADD COLUMN warehouse_fee_vat_rate REAL DEFAULT 10`,
    `ALTER TABLE imports ADD COLUMN demurrage_vat_rate REAL DEFAULT 0`,
    `ALTER TABLE imports ADD COLUMN detention_fee_vat_rate REAL DEFAULT 0`,
    `ALTER TABLE imports ADD COLUMN inland_freight_vat_rate REAL DEFAULT 10`,
    // 전표: 통관번호/매출번호 표시용 (related_ref는 내부 dedup 키)
    `ALTER TABLE journal_entries ADD COLUMN doc_no TEXT`,
    // 메일 계정: 발신자 표시 주소 (daum.net 인증 → ynk2014.com 발신 등)
    `ALTER TABLE mail_accounts ADD COLUMN from_email TEXT`,
    // 메일 계정: HTML 서명
    `ALTER TABLE mail_accounts ADD COLUMN signature_html TEXT`,
    // 문서양식: 특정 레코드(매출 등)에 종속된 문서를 빠르게 조회하기 위한 연결 필드
    `ALTER TABLE documents ADD COLUMN related_type TEXT`,
    `ALTER TABLE documents ADD COLUMN related_id TEXT`,
    // 공급업체 자료요청 링크: 생성자가 링크를 다시 조회할 수 있도록 암호화된 원문도 함께 저장
    // (해시는 그대로 실제 인증 경로로 사용 — 이 컬럼은 내부 화면 재조회 편의용 추가 저장일 뿐)
    `ALTER TABLE supplier_request_links ADD COLUMN token_encrypted TEXT`,
    // 견적서/발주서 인쇄본에 작성자 본인 이메일을 표시하기 위함 (기존엔 회사 고정 이메일만 표시됨)
    `ALTER TABLE quotes ADD COLUMN created_by_email TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN created_by_name TEXT`,
    `ALTER TABLE purchase_orders ADD COLUMN created_by_email TEXT`,
    // 출하검사(outgoing_inspection) 섹션도 evaluation_test와 같은 approval_doc_test_items
    // 테이블을 section_id로만 구분해 재사용 — 출하검사에만 필요한 4개 컬럼을 추가.
    `ALTER TABLE approval_doc_test_items ADD COLUMN inspector TEXT`,
    `ALTER TABLE approval_doc_test_items ADD COLUMN inspection_date TEXT`,
    `ALTER TABLE approval_doc_test_items ADD COLUMN sampling_criteria TEXT`,
    `ALTER TABLE approval_doc_test_items ADD COLUMN equipment TEXT`,
  ];
  // 메일 동기화 커서 테이블 (계정+폴더별 cursor_uid: 다음에 내려받을 UID 범위의 상한)
  db.exec(`CREATE TABLE IF NOT EXISTS mail_sync_cursors (
    account_id TEXT NOT NULL,
    folder TEXT NOT NULL DEFAULT 'inbox',
    cursor_uid INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, folder)
  )`);
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
  // 매입원가(purchase_cogs) 처리방향 결제확인 시 자동 생성되는 전표(journal_entries)를
  // 역참조 — commissions.journal_entry_id와 동일한 패턴.
  try { db.exec(`ALTER TABLE cost_records ADD COLUMN journal_entry_id TEXT`); } catch { /* already exists */ }
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
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN fx_usd_sell REAL`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN cert_costs_json TEXT DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN attachments_json TEXT DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN fx_rmb_sell REAL`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN port_from TEXT`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN port_to TEXT`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN notion_page_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN notion_synced_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN epr_obligation_rate REAL DEFAULT 0.20`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN customs_no TEXT`); } catch {}
  try { db.exec(`ALTER TABLE estimator_cases ADD COLUMN sales_no TEXT`); } catch {}

  // 복식부기 회계 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      group_name TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_no TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_by TEXT,
      related_ref TEXT,
      debit_total REAL DEFAULT 0,
      credit_total REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      account_code TEXT NOT NULL,
      account_name TEXT NOT NULL,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      currency TEXT DEFAULT 'KRW',
      fx_rate REAL DEFAULT 1,
      memo TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 파일 관리 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS file_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT DEFAULT NULL,
      is_system INTEGER DEFAULT 0,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS file_items (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      folder_id TEXT DEFAULT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_type TEXT,
      category TEXT,
      share_token TEXT UNIQUE,
      share_expires_at TEXT,
      uploaded_by TEXT,
      uploaded_by_id TEXT,
      notion_synced INTEGER DEFAULT 0,
      notion_page_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS quote_extractions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      supplier_name TEXT,
      quote_date TEXT,
      items_json TEXT DEFAULT '[]',
      raw_text TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 견적서 폴더 자동생성
  try {
    const existing = db.prepare("SELECT id FROM file_folders WHERE name='견적서' AND is_system=1").get();
    if (!existing) {
      const ts = new Date().toISOString();
      db.prepare("INSERT INTO file_folders (id,name,is_system,description,created_by,created_at,updated_at) VALUES (?,?,1,?,?,?,?)")
        .run('folder_system_quotes', '견적서', '공급업체 견적서 (자동 추출)', 'system', ts, ts);
    }
  } catch { /* ignore */ }

  // 수익분석 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS profit_analyses (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      analysis_date TEXT,
      sale_id TEXT,
      sale_business_id TEXT,
      import_id TEXT,
      import_business_id TEXT,
      sale_amount REAL DEFAULT 0,
      sale_currency TEXT DEFAULT 'KRW',
      exchange_rate REAL DEFAULT 1,
      product_items_json TEXT DEFAULT '[]',
      freight_cost REAL DEFAULT 0,
      inland_freight REAL DEFAULT 0,
      broker_fee REAL DEFAULT 0,
      duty REAL DEFAULT 0,
      vat_import REAL DEFAULT 0,
      wire_fee REAL DEFAULT 0,
      extra_costs_json TEXT DEFAULT '[]',
      memo TEXT,
      status TEXT DEFAULT 'draft',
      history_json TEXT DEFAULT '[]',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 계정과목 기초 데이터 삽입
  const acctCount = (db.prepare('SELECT COUNT(*) as n FROM chart_of_accounts').get() as {n:number}).n;
  if (acctCount === 0) {
    const insertAcct = db.prepare('INSERT INTO chart_of_accounts (id,code,name,type,normal_balance,group_name,description) VALUES (?,?,?,?,?,?,?)');
    const accounts: string[][] = [
      ['ac001','1010','현금','asset','debit','유동자산','현금 및 현금성 자산'],
      ['ac002','1020','보통예금','asset','debit','유동자산','은행 보통예금 계좌'],
      ['ac003','1030','외화예금','asset','debit','유동자산','외화 예금 계좌 (USD, CNY 등)'],
      ['ac004','1040','외상매출금','asset','debit','유동자산','외상으로 판매한 금액 (매출채권)'],
      ['ac005','1050','미수금','asset','debit','유동자산','아직 받지 못한 돈'],
      ['ac006','1060','선급금','asset','debit','유동자산','미리 지급한 금액'],
      ['ac007','1070','부가세대급금','asset','debit','유동자산','매입 시 납부한 부가세 (환급 예정)'],
      ['ac008','1080','선급비용','asset','debit','유동자산','미리 지급한 비용 (보험료 등)'],
      ['ac009','1090','재고자산','asset','debit','유동자산','판매용 상품/제품 재고'],
      ['ac010','1310','토지','asset','debit','비유동자산','토지'],
      ['ac011','1320','건물','asset','debit','비유동자산','건물 및 구조물'],
      ['ac012','1330','차량운반구','asset','debit','비유동자산','업무용 차량'],
      ['ac013','1340','비품','asset','debit','비유동자산','사무용 비품, 집기 등'],
      ['ac014','1350','감가상각누계액','asset','credit','비유동자산','자산 가치 감소 누계 (차감)'],
      ['ac015','2010','외상매입금','liability','credit','유동부채','외상으로 구입한 금액 (매입채무)'],
      ['ac016','2020','미지급금','liability','credit','유동부채','아직 지급하지 않은 금액'],
      ['ac017','2030','선수금','liability','credit','유동부채','미리 받은 대금'],
      ['ac018','2040','예수금','liability','credit','유동부채','급여 공제액 (4대보험, 세금)'],
      ['ac019','2050','부가세예수금','liability','credit','유동부채','매출 시 수령한 부가세'],
      ['ac020','2060','미지급비용','liability','credit','유동부채','발생했지만 미지급 비용'],
      ['ac021','2070','단기차입금','liability','credit','유동부채','1년 이내 상환 차입금'],
      ['ac022','2210','장기차입금','liability','credit','비유동부채','1년 이상 차입금'],
      ['ac023','3010','자본금','equity','credit','자본','출자한 자본금'],
      ['ac024','3020','이익잉여금','equity','credit','자본','누적된 이익'],
      ['ac025','4010','국내매출','revenue','credit','매출','국내 판매 수익'],
      ['ac026','4020','수출매출','revenue','credit','매출','수출 판매 수익'],
      ['ac027','4030','기타수익','revenue','credit','영업외수익','기타 잡수익'],
      ['ac028','4040','이자수익','revenue','credit','영업외수익','예금/대여금 이자'],
      ['ac029','4050','환차익','revenue','credit','영업외수익','외환 환율 변동 이익'],
      ['ac030','5010','매출원가','expense','debit','매출원가','판매 상품의 원가'],
      ['ac031','5110','급여','expense','debit','판매관리비','임직원 급여'],
      ['ac032','5120','복리후생비','expense','debit','판매관리비','식대, 경조사비 등'],
      ['ac033','5130','여비교통비','expense','debit','판매관리비','출장비, 교통비'],
      ['ac034','5140','접대비','expense','debit','판매관리비','거래처 접대 비용'],
      ['ac035','5150','통신비','expense','debit','판매관리비','전화, 인터넷 요금'],
      ['ac036','5160','수도광열비','expense','debit','판매관리비','수도, 전기, 가스'],
      ['ac037','5170','임차료','expense','debit','판매관리비','사무실/창고 임대료'],
      ['ac038','5180','보험료','expense','debit','판매관리비','각종 보험료'],
      ['ac039','5190','소모품비','expense','debit','판매관리비','소모성 자재'],
      ['ac040','5200','광고선전비','expense','debit','판매관리비','광고, 마케팅 비용'],
      ['ac041','5210','운반비','expense','debit','판매관리비','국내 운송비'],
      ['ac042','5220','해상운임','expense','debit','수입원가','수입 해상 운임'],
      ['ac043','5230','관세','expense','debit','수입원가','수입 관세'],
      ['ac044','5240','통관수수료','expense','debit','수입원가','관세사 통관 수수료'],
      ['ac045','5250','검품비','expense','debit','수입원가','검품 비용'],
      ['ac046','5260','창고비','expense','debit','수입원가','보관/창고 비용'],
      ['ac047','5270','수수료','expense','debit','판매관리비','각종 수수료'],
      ['ac048','5280','감가상각비','expense','debit','판매관리비','자산 감가상각'],
      ['ac049','5290','잡비','expense','debit','판매관리비','기타 잡비'],
      ['ac050','5300','이자비용','expense','debit','영업외비용','차입금 이자'],
      ['ac051','5310','환차손','expense','debit','영업외비용','외환 환율 변동 손실'],
      ['ac052','5320','세금과공과','expense','debit','판매관리비','세금, 공과금'],
    ];
    const insertMany = db.transaction(() => { accounts.forEach(a => insertAcct.run(...a)); });
    insertMany();
  }

  // 계정과목 누락분 추가 (idempotent)
  try {
    const addAcct = db.prepare('INSERT OR IGNORE INTO chart_of_accounts (id,code,name,type,normal_balance,group_name,description) VALUES (?,?,?,?,?,?,?)');
    const extraAccounts: string[][] = [
      ['ac101','1351','부가세대급금','asset','debit','유동자산','매입 시 납부한 부가세 (환급 예정)'],
      ['ac102','1460','상품','asset','debit','유동자산','매입한 판매용 상품 재고'],
      ['ac103','2510','외상매입금','liability','credit','유동부채','외상으로 구입한 금액 (매입채무)'],
      ['ac104','5440','지급수수료','expense','debit','수입원가','포워더·관세사 등 각종 수수료'],
      ['ac105','5450','Demurrage/체화료','expense','debit','수입원가','컨테이너 지체·체화료'],
      ['ac106','5460','내륙운송비','expense','debit','수입원가','항구→창고 내륙 운송비'],
      ['ac107','4060','수수료수익','revenue','credit','영업외수익','해외 업체로부터 받는 커미션 등 수수료 수익'],
    ];
    db.transaction(() => { extraAccounts.forEach(a => addAcct.run(...a)); })();
  } catch { /* ignore */ }

  // 알림 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 휴가 정책 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS leave_policies (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      user_name TEXT NOT NULL,
      annual_days INTEGER DEFAULT 15,
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 휴가 신청 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approver_id TEXT,
      approver_name TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 업무 댓글 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 업무 모듈 연결 테이블
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS task_links (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      module TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_label TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // tasks 테이블 확장 (assignee)
  try { db.exec(`ALTER TABLE tasks ADD COLUMN assignee_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE tasks ADD COLUMN assignee_name TEXT`); } catch { /* already exists */ }

  // calendar_events 테이블 확장 (카테고리/관련ID/작성자명)
  try { db.exec(`ALTER TABLE calendar_events ADD COLUMN category TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE calendar_events ADD COLUMN related_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE calendar_events ADD COLUMN created_by_name TEXT`); } catch { /* already exists */ }

  // 문서 양식 테이블 (공문서/수입물품대금비용정산서 등, 앞으로 추가될 양식 전부 포함)
  // doc_type으로 종류를 구분하고 data_json에 종류별 필드를 자유롭게 담는다 - 새 양식이 추가돼도 스키마 변경 불필요
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      doc_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      data_json TEXT NOT NULL DEFAULT '{}',
      history_json TEXT NOT NULL DEFAULT '[]',
      related_type TEXT,
      related_id TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 오더 추적 잔여수량 기준시점(cutover) 조정: 자동추적(판매 연동) 도입 이전 발주 건은
  // 관리자가 특정 시점 기준 잔여수량을 수동으로 입력해두고, 그 시점 이후 판매분만 자동 차감한다.
  // 같은 PO+품목에 대해 관리자가 여러 번 재조정할 수 있도록 UPSERT + history_json으로 이력을 남긴다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS po_qty_adjustments (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL,
      po_business_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      cutover_date TEXT NOT NULL,
      remaining_qty REAL NOT NULL,
      note TEXT,
      history_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(po_id, item_id)
    )`);
  } catch { /* already exists */ }

  // 입금 계좌 등록 (커미션 등 해외 입금을 받을 통장 목록 - 통화별로 관리)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KRW',
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      holder_name TEXT,
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 해외 커미션(수수료) 수입 관리
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      foreign_company TEXT NOT NULL,
      date TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      amount REAL NOT NULL DEFAULT 0,
      exchange_rate REAL NOT NULL DEFAULT 1,
      amount_krw REAL NOT NULL DEFAULT 0,
      account_id TEXT,
      deposit_date TEXT,
      invoice_files_json TEXT NOT NULL DEFAULT '[]',
      deposit_files_json TEXT NOT NULL DEFAULT '[]',
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      journal_entry_id TEXT,
      notion_id TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // DB 자동 백업 실행 이력 (관리자 설정 화면에서 조회/복원용)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS backup_runs (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      triggered_by TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      kind TEXT NOT NULL DEFAULT 'db',
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // ── 중국 공급업체 자료 요청 및 제출 시스템 (고효율 인증 자료) ──────────────────
  // 그룹웨어 로그인 없이 랜덤 토큰 링크로만 접근하는 외부 작성 화면 + 내부 프로젝트 관리.
  // 인증/알림/DB/파일저장은 기존 시스템을 그대로 재사용하고, 이 모듈은 데이터만 새로 추가한다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_request_projects (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      product_name TEXT NOT NULL,
      internal_ref_no TEXT,
      supplier_name TEXT NOT NULL,
      contact_person TEXT,
      requested_at TEXT,
      due_date TEXT,
      memo TEXT,
      default_language TEXT NOT NULL DEFAULT 'ko',
      status TEXT NOT NULL DEFAULT 'draft',
      template_version TEXT NOT NULL DEFAULT 'v1',
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_request_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      token_encrypted TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_reason TEXT
    )`);
  } catch { /* already exists */ }

  // 프로젝트당 "현재 작성중인 원본" 1행. 원문/한국어값/번역상태/검토여부는 data_json 안에
  // 필드키별로 {original, lang, korean, translationStatus, reviewed, updatedAt} 구조로 저장.
  // hidden_data_json: 컨버터 사용여부 변경 시 즉시 삭제하지 않고 숨겨서 보존해야 하는 이전 입력값.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_form_responses (
      id TEXT PRIMARY KEY,
      project_id TEXT UNIQUE NOT NULL,
      converter_type TEXT,
      test_categories_json TEXT NOT NULL DEFAULT '[]',
      derived_change_checks_json TEXT NOT NULL DEFAULT '{}',
      data_json TEXT NOT NULL DEFAULT '{}',
      hidden_data_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 등기구 부품 리스트 / 컨버터 내부 부품 리스트 / 복수부품 - 세 반복 목록을 공통 구조로 관리.
  // row_key: 원본 표의 고정 행(예: converter/led_package/led_pcb/...)이면 그 키, 사용자가
  // 추가한 행이면 null (DOCX 출력 시 고정 행은 그대로, 초과분은 마지막 행 서식을 복제해 추가).
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_component_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      list_type TEXT NOT NULL,
      row_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      part_name TEXT,
      model_name TEXT,
      spec_text TEXT,
      material TEXT,
      width_mm TEXT,
      depth_mm TEXT,
      height_mm TEXT,
      qty TEXT,
      manufacturer TEXT,
      remark TEXT,
      original_json TEXT NOT NULL DEFAULT '{}',
      korean_json TEXT NOT NULL DEFAULT '{}',
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_attachments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_current INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT NOT NULL,
      uploaded_by_name TEXT,
      submission_version INTEGER NOT NULL DEFAULT 0,
      image_page_selection INTEGER,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_submission_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      submitted_by_name TEXT,
      status_at_submission TEXT,
      data_snapshot_json TEXT NOT NULL,
      attachments_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_closure_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      closed_by_user_id TEXT NOT NULL,
      closed_by_user_name TEXT,
      closed_at TEXT NOT NULL,
      submission_version_at_closure INTEGER,
      data_snapshot_json TEXT NOT NULL,
      attachments_snapshot_json TEXT NOT NULL,
      reason_memo TEXT,
      reopened_at TEXT,
      reopened_by_user_id TEXT,
      reopened_by_user_name TEXT,
      reopen_reason TEXT
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_audit_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_user_id TEXT,
      actor_user_name TEXT,
      actor_token_hash TEXT,
      before_json TEXT,
      after_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      submission_version INTEGER,
      related_attachment_id TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }
  // ── 중국 공급업체 자료 요청 시스템 끝 ─────────────────────────────────────────

  // ── 제품 승인서·제품 사양서 작성 및 관리 시스템 시작 ──────────────────────────
  // 목적/설계는 위 supplier_* 시스템(HEE 인증용 고정 좌표 양식)과 다르다 — 여기는 섹션을
  // 껐다 켜면 장번호·목차·페이지번호가 자동 재계산되는 동적 문서 시스템이라 완전히 새
  // 테이블군으로 분리했다(접두사 approval_doc_). lib/approval-doc/*.ts 참고.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS company_brand_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      company_name_ko TEXT,
      company_name_en TEXT,
      logo_url TEXT,
      watermark_url TEXT,
      watermark_opacity REAL NOT NULL DEFAULT 0.08,
      primary_color TEXT,
      secondary_color TEXT,
      accent_color TEXT,
      footer_text TEXT,
      cover_layout_variant TEXT NOT NULL DEFAULT 'standard',
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      style_key TEXT NOT NULL DEFAULT 'classic',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      base_font TEXT,
      heading_font TEXT,
      toc_leader_style TEXT NOT NULL DEFAULT 'dot',
      header_layout_json TEXT,
      footer_layout_json TEXT,
      cover_layout_json TEXT,
      table_style_json TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_projects (
      id TEXT PRIMARY KEY,
      business_id TEXT UNIQUE NOT NULL,
      product_name TEXT NOT NULL,
      model_name TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'approval',
      revision TEXT NOT NULL DEFAULT 'A',
      customer_name TEXT,
      supplier_name TEXT,
      contact_person TEXT,
      internal_ref_no TEXT,
      product_category TEXT,
      has_converter INTEGER,
      template_id TEXT,
      brand_profile_id TEXT,
      default_language TEXT NOT NULL DEFAULT 'zh',
      final_language TEXT NOT NULL DEFAULT 'ko',
      status TEXT NOT NULL DEFAULT 'draft',
      due_date TEXT,
      memo TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // supplier_request_links와 완전히 동일한 보안 패턴(토큰 해시만 인증 경로로 사용,
  // token_encrypted는 내부 재조회 편의용) — lib/approval-doc/token.ts 참고.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      token_encrypted TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_reason TEXT
    )`);
  } catch { /* already exists */ }

  // 프로젝트별 "장(챕터)" 인스턴스 — 동적 목차/채번의 핵심 테이블. chapter_number_cache는
  // 화면 미리보기 전용이며 실제 문서 생성 시에는 항상 numbering.ts로 새로 계산한다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_sections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_type TEXT NOT NULL,
      included INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      custom_title TEXT,
      chapter_number_cache TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_general_spec_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      division TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      inspection_item TEXT NOT NULL,
      unit TEXT,
      spec_value_original TEXT,
      spec_value_korean TEXT,
      min_value_original TEXT,
      min_value_korean TEXT,
      max_value_original TEXT,
      max_value_korean TEXT,
      is_reference_only INTEGER NOT NULL DEFAULT 0,
      measured_value_original TEXT,
      measured_value_korean TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_product_models (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      model_code TEXT NOT NULL,
      description_original TEXT,
      description_korean TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_dimension_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      item_label TEXT NOT NULL,
      value_mm_original TEXT,
      value_mm_korean TEXT,
      tolerance_original TEXT,
      tolerance_korean TEXT,
      weight_g_original TEXT,
      weight_g_korean TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_packing_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      packing_type TEXT NOT NULL,
      field_key TEXT NOT NULL,
      value_original TEXT,
      value_korean TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_test_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      test_category TEXT NOT NULL,
      item_label TEXT,
      spec_value_original TEXT,
      spec_value_korean TEXT,
      measured_value_original TEXT,
      measured_value_korean TEXT,
      unit TEXT,
      pass_fail TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_certification_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      cert_type TEXT NOT NULL,
      cert_number TEXT,
      issuing_body TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      attachment_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 핵심부품 사양서(key_component) + 컨버터 부품표(converter_bom) 공용 — 열 이름을
  // supplier_component_items와 최대한 통일해 입력 그리드 UI를 재사용/포크하기 쉽게 했다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_component_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      list_type TEXT NOT NULL,
      row_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      part_name TEXT,
      model_name TEXT,
      spec_text TEXT,
      manufacturer TEXT,
      qty TEXT,
      unit_price_original TEXT,
      unit_price_korean TEXT,
      material TEXT,
      width_mm TEXT,
      depth_mm TEXT,
      height_mm TEXT,
      remark TEXT,
      original_json TEXT NOT NULL DEFAULT '{}',
      korean_json TEXT NOT NULL DEFAULT '{}',
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_attachments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT,
      category_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_current INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT NOT NULL,
      uploaded_by_name TEXT,
      submission_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  // 원본(attachments)은 절대 덮어쓰지 않고, 자르기/회전/배경제거 결과만 별도 보관 —
  // 하나의 원본에서 여러 번 다시 편집해도 원본 파일은 그대로 남는다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_image_placements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      source_attachment_id TEXT NOT NULL,
      source_pdf_page INTEGER,
      crop_rect_json TEXT,
      rotation_deg INTEGER NOT NULL DEFAULT 0,
      bg_removed INTEGER NOT NULL DEFAULT 0,
      edited_file_path TEXT,
      caption_original TEXT,
      caption_korean TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_revision_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_label TEXT NOT NULL,
      revision_date TEXT,
      note_original TEXT,
      note_korean TEXT,
      traced_by TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_submission_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      submitted_by_name TEXT,
      status_at_submission TEXT,
      data_snapshot_json TEXT NOT NULL,
      attachments_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_closure_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      closed_by_user_id TEXT NOT NULL,
      closed_by_user_name TEXT,
      closed_at TEXT NOT NULL,
      submission_version_at_closure INTEGER,
      data_snapshot_json TEXT NOT NULL,
      attachments_snapshot_json TEXT NOT NULL,
      reason_memo TEXT,
      reopened_at TEXT,
      reopened_by_user_id TEXT,
      reopened_by_user_name TEXT,
      reopen_reason TEXT
    )`);
  } catch { /* already exists */ }

  // 2-pass 문서 생성 파이프라인(lib/approval-doc/generate-pipeline.ts)의 산출물 이력 —
  // pass_number 1/2 두 행이 매 생성마다 남아, 목차 페이지번호가 어떻게 확정됐는지 추적 가능.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_generated_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      submission_version INTEGER,
      pass_number INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      stored_path TEXT,
      page_count INTEGER,
      toc_page_map_json TEXT,
      template_id TEXT,
      brand_profile_id TEXT,
      generated_by TEXT,
      generated_by_name TEXT,
      generated_at TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0
    )`);
  } catch { /* already exists */ }

  // 교차검증(validate.ts)이 불일치를 찾아도 자동으로 고치지 않고 "확인(승인)" 처리만
  // 가능하게 하는 테이블 — 이 승인 자체도 감사로그에 남는다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_validation_acknowledgements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      acknowledged_by TEXT,
      acknowledged_by_name TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS approval_doc_audit_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_user_id TEXT,
      actor_user_name TEXT,
      actor_token_hash TEXT,
      before_json TEXT,
      after_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      submission_version INTEGER,
      related_attachment_id TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch { /* already exists */ }
  // ── 제품 승인서·제품 사양서 작성 및 관리 시스템 끝 ────────────────────────────

  // ── 포워더운임(해상운임 견적) 관리 시작 ──────────────────────────────────────
  // 포워딩 업체마다 견적서 형식이 완전히 달라 자동파싱 대신 수동입력+붙여넣기로
  // 기록하되, 매달 새로 받는 견적은 기존 행을 덮어쓰지 않고 새 행으로 계속
  // 쌓는다(append-only) — "이력이 남아야 한다"는 요구사항의 핵심.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS forwarder_rates (
      id TEXT PRIMARY KEY,
      forwarder_id TEXT,
      forwarder_name TEXT NOT NULL,
      pol TEXT NOT NULL,
      pod TEXT NOT NULL,
      container_type TEXT NOT NULL,
      carrier TEXT,
      rate_type TEXT,
      total_amount REAL NOT NULL,
      total_currency TEXT NOT NULL DEFAULT 'USD',
      breakdown_json TEXT DEFAULT '[]',
      quote_date TEXT,
      valid_until TEXT,
      doc_no TEXT,
      contact_person TEXT,
      source_file_url TEXT,
      memo TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_forwarder_rates_lane ON forwarder_rates(pol, pod)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_forwarder_rates_forwarder ON forwarder_rates(forwarder_id)`);
  } catch { /* already exists */ }
  // "몇월 견적"인지 조회/그룹핑하기 위한 컬럼 — quote_date는 원시 날짜 문자열이라
  // 같은 달 안에 여러 번 나눠 입력되면 "이번달 갱신"이 그 중 하나만 인식하던 문제가 있었다.
  try { db.exec(`ALTER TABLE forwarder_rates ADD COLUMN quote_month TEXT`); } catch { /* already exists */ }
  try {
    db.exec(`UPDATE forwarder_rates SET quote_month = substr(COALESCE(quote_date, created_at), 1, 7) WHERE quote_month IS NULL`);
  } catch { /* ignore */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_forwarder_rates_month ON forwarder_rates(forwarder_name, quote_month)`); } catch { /* already exists */ }
  // ── 포워더운임(해상운임 견적) 관리 끝 ────────────────────────────────────────

  // ── 사내 AI Assistant 시작 ──────────────────────────────────────────────────
  // Provider(Cloudflare 등)는 완전히 교체 가능해야 하므로 provider_type 컬럼으로
  // 구분만 하고, 벤더별 필드는 공용 컬럼(계정/토큰/모델)으로 최대한 통일해 둔다.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      enabled INTEGER NOT NULL DEFAULT 0,
      default_chat_provider_id TEXT,
      default_embedding_provider_id TEXT,
      rate_limit_per_user_per_hour INTEGER NOT NULL DEFAULT 60,
      search_top_k INTEGER NOT NULL DEFAULT 8,
      qdrant_url TEXT,
      qdrant_api_key_encrypted TEXT,
      qdrant_collection TEXT NOT NULL DEFAULT 'tradeos_knowledge',
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 100,
      account_id TEXT,
      api_token_encrypted TEXT,
      base_url TEXT,
      chat_model TEXT,
      embedding_model TEXT,
      supports_chat INTEGER NOT NULL DEFAULT 1,
      supports_embedding INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'healthy',
      last_success_at TEXT,
      last_failure_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      cooldown_until TEXT,
      last_error TEXT,
      daily_usage_estimate INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON ai_providers(enabled, priority)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_prompt_settings (
      prompt_key TEXT PRIMARY KEY,
      custom_value TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT,
      title TEXT,
      context_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      provider_id TEXT,
      model TEXT,
      tool_calls_json TEXT,
      sources_json TEXT,
      token_usage_json TEXT,
      created_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      message_id TEXT,
      user_id TEXT,
      user_name TEXT,
      provider_id TEXT,
      provider_type TEXT,
      model TEXT,
      request_type TEXT NOT NULL,
      success INTEGER NOT NULL,
      error TEXT,
      latency_ms INTEGER,
      fallback_from_provider_id TEXT,
      created_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_document_index (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      content_hash TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      embedding_model TEXT,
      embedding_version TEXT,
      department_id TEXT,
      visibility TEXT,
      security_level TEXT,
      source_updated_at TEXT,
      indexed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_document_index_source ON ai_document_index(source_type, source_id)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_index_jobs (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processed_at TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_index_jobs_status ON ai_index_jobs(status, created_at)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_tool_logs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      message_id TEXT,
      user_id TEXT,
      tool_name TEXT NOT NULL,
      args_json TEXT,
      result_summary TEXT,
      allowed INTEGER NOT NULL DEFAULT 1,
      denied_reason TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_created ON ai_tool_logs(created_at)`);
  } catch { /* already exists */ }
  // ── 사내 AI Assistant 끝 ────────────────────────────────────────────────────

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
  // purchase_orders도 동일한 노션 동기화 중복 문제가 있었음 (수정 시 노션 페이지ID가 바뀌면서
  // 다음 조회 때 새 id로 다시 삽입되어 중복 행이 생기던 버그, GET 핸들러는 이미 수정됨)
  try {
    db.exec(`
      DELETE FROM purchase_orders WHERE id IN (
        SELECT id FROM (
          SELECT id, business_id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY length(id) ASC, created_at ASC) AS rn
          FROM purchase_orders
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
    // 전표번호 중복 방지 (과거 COUNT(*) 기반 채번 버그로 중복 생성된 적 있음)
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_entry_no ON journal_entries(entry_no)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type, created_at DESC)`,
    // 공급업체 자료요청 시스템 - 토큰 조회는 요청마다 발생하므로 필수, 나머지는 project_id 조회 최적화
    `CREATE INDEX IF NOT EXISTS idx_supplier_links_token       ON supplier_request_links(token_hash, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_links_project     ON supplier_request_links(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_components_project ON supplier_component_items(project_id, list_type, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_attachments_project ON supplier_attachments(project_id, category_key, is_current)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_versions_project   ON supplier_submission_versions(project_id, version_no DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_closures_project   ON supplier_closure_snapshots(project_id, closed_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_audit_project      ON supplier_audit_logs(project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_projects_status    ON supplier_request_projects(status, created_at DESC)`,
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
