import fs from 'fs';
import path from 'path';
import { getDb } from '../db/sqlite';
import { getAppRootDir } from '../db/backup';

export type SourceOfTruth = 'database' | 'nas' | 'rebuildable' | 'external+local-snapshot' | 'env+database';

export interface BackupDomain {
  id: string;
  label: string;
  sourceOfTruth: SourceOfTruth;
  backedUpBy: string;
  notes?: string;
}

/**
 * 이 프로젝트는 85개 테이블이 전부 SQLite 파일 하나에 있어서(별도 DB 여러 개로 쪼개져
 * 있지 않음), 테이블 단위 레지스트리는 사실 의미가 없다 — DB 파일 하나를 백업하면
 * 테이블이 몇 개든 자동으로 전부 포함된다. 그래서 "테이블"이 아니라 "저장 도메인"
 * 단위로 관리한다. 새 기능이 생겨도 SQLite 안에 테이블만 추가하는 한 이 레지스트리를
 * 매번 고칠 필요가 없다 — 실제로 새 저장 경로(NAS 새 폴더, 새 외부 SaaS 등)가 생길
 * 때만 여기에 추가하면 된다.
 */
export const BACKUP_DOMAINS: BackupDomain[] = [
  {
    id: 'sqlite_database',
    label: '전체 SQLite 데이터베이스 (제품/발주/선적/견적/매출/비용/커미션/회계/AI 설정 등 전체 테이블)',
    sourceOfTruth: 'database',
    backedUpBy: 'db.backup() 파일 단위 consistent 스냅샷 — 테이블이 몇 개든 자동 포함',
  },
  {
    id: 'attachments',
    label: '첨부파일 (UPLOAD_DIR — 검사사진/제품사진/계약서/B·L/Invoice/증명서 등)',
    sourceOfTruth: 'nas',
    backedUpBy: 'tar 아카이브 + 파일별 SHA-256 체크섬 + DB 참조 무결성 검사',
  },
  {
    id: 'qdrant_vectors',
    label: 'Qdrant 벡터(사내 지식 검색 인덱스)',
    sourceOfTruth: 'rebuildable',
    backedUpBy: 'Qdrant snapshot(1차) + 원본 DB/NAS 기준 전체 재인덱싱(snapshot 복원 실패 시 대체 경로)',
  },
  {
    id: 'ai_config',
    label: 'AI Provider/Prompt/임계값/Qdrant 활성 컬렉션 설정',
    sourceOfTruth: 'database',
    backedUpBy: 'sqlite_database 도메인에 포함(별도 백업 불필요)',
  },
  {
    id: 'secrets',
    label: 'API 토큰/비밀번호(AUTH_SECRET, Notion, Mail, NAS, Qdrant, Cloudflare Provider 등)',
    sourceOfTruth: 'env+database',
    backedUpBy: 'Recovery Password로 암호화된 secrets.enc(scrypt+AES-256-GCM)',
  },
  {
    id: 'notion_synced',
    label: 'Notion 동기화 데이터(회사/제품/발주/선적 등 연동 DB)',
    sourceOfTruth: 'external+local-snapshot',
    backedUpBy: 'sqlite_database에 이미 캐시된 부분만 보호됨',
    notes: '아직 한 번도 동기화되지 않은 신규 Notion 페이지, 또는 Notion 서비스 자체 소멸 시 데이터는 복구 불가 — 완전한 보호 아님(Partial)',
  },
  {
    id: 'application',
    label: '애플리케이션(standalone 빌드 + 정적자산 + package.json/lock)',
    sourceOfTruth: 'rebuildable',
    backedUpBy: 'tar 아카이브 + BUILD_INFO.json(git commit/버전 기록)',
  },
  {
    id: 'docker_sidecars',
    label: 'Docker 컨테이너(Qdrant, docverify)',
    sourceOfTruth: 'rebuildable',
    backedUpBy: 'docker inspect 설정 기록(합성 docker-compose.yml) + docker save 오프라인 이미지 아카이브',
  },
  {
    id: 'app_releases',
    label: '데스크톱 앱 릴리스 설치파일(data/releases/{windows,macos} — msi/exe/dmg)',
    sourceOfTruth: 'nas',
    backedUpBy: 'Complete Backup 시 data/releases 전체 복사(있을 때만 — 릴리스를 하나도 안 올렸으면 정상적으로 생략됨). app_releases 테이블 메타데이터는 sqlite_database 도메인에 포함.',
  },
];

export function getSourceOfTruthRegistry(): BackupDomain[] {
  return BACKUP_DOMAINS;
}

/** 이 레지스트리가 만들어진 시점에 실제로 존재했던 테이블 목록 — sqlite_database
 * 도메인이 "이미 다 커버하고 있다"는 전제를 계속 신뢰할 수 있는지 확인하는 정보성
 * 기준선이다(새 테이블이 생겨도 백업 자체는 자동으로 커버되므로 실패 사유는 아님). */
const KNOWN_TABLES_BASELINE = new Set([
  'admin_tools', 'admin_tools_audit_logs', 'admin_tools_platform_settings',
  'ai_conversations', 'ai_document_index', 'ai_index_jobs', 'ai_messages', 'ai_prompt_settings',
  'ai_providers', 'ai_settings', 'ai_tool_logs', 'ai_usage_logs', 'ai_vector_collections',
  'approval_attachments', 'approval_comments', 'approval_doc_attachments', 'approval_doc_audit_logs',
  'approval_doc_certification_items', 'approval_doc_closure_snapshots', 'approval_doc_component_items',
  'approval_doc_dimension_items', 'approval_doc_general_spec_items', 'approval_doc_generated_documents',
  'approval_doc_image_placements', 'approval_doc_links', 'approval_doc_packing_items',
  'approval_doc_product_models', 'approval_doc_projects', 'approval_doc_revision_history',
  'approval_doc_sections', 'approval_doc_submission_versions', 'approval_doc_templates',
  'approval_doc_test_items', 'approval_doc_validation_acknowledgements', 'approvals', 'backup_runs',
  'bank_accounts', 'biz_sequences', 'calendar_events', 'channels', 'chart_of_accounts', 'claims',
  'commissions', 'companies', 'company_brand_profiles', 'cost_records', 'documents',
  'es_expressions', 'es_sources', 'es_templates', 'es_projects', 'es_project_sources',
  'es_render_logs', 'es_audit_logs', 'es_settings', 'estimator_cases',
  'expenses', 'file_folders', 'file_items', 'foreign_invoices', 'forwarder_rates', 'imports',
  'inspections', 'inventory', 'journal_entries', 'journal_lines', 'leave_policies', 'leave_requests',
  'mail', 'mail_accounts', 'mail_contacts', 'mail_ext_messages', 'mail_sync_cursors', 'media_render_jobs', 'messages',
  'notifications', 'photo_album_items', 'photo_albums', 'photo_audit_logs', 'photo_comments',
  'photo_derivatives', 'photo_entity_links', 'photo_favorites', 'photo_folders', 'photo_internal_shares',
  'photo_jobs', 'photo_settings', 'photo_share_access_logs', 'photo_share_items', 'photo_shares',
  'photo_tag_links', 'photo_tags', 'photos', 'po_qty_adjustments', 'products', 'profit_analyses', 'purchase_orders',
  'quote_extractions', 'quotes', 'sales', 'scheduled_ext_mails', 'shipments', 'supplier_attachments',
  'supplier_audit_logs', 'supplier_closure_snapshots', 'supplier_component_items',
  'supplier_form_responses', 'supplier_request_links', 'supplier_request_projects',
  'supplier_submission_versions', 'task_comments', 'task_links', 'tasks', 'users',
]);

/** 백업 목표 tar에 포함되는 것으로 알려진 data/ 하위 디렉터리 — 새로운 최상위 저장
 * 경로가 여기 없이 생기면(예: data/exports/ 같은 것) 백업 스코프에서 누락될 수 있어
 * 경고 대상이다. uploads/backups는 이미 알고 있으므로 정상. */
const KNOWN_DATA_SUBDIRS = new Set(['uploads', 'backups', 'releases']);

export interface DriftWarning { severity: 'info' | 'warning'; message: string }

export function detectDrift(): DriftWarning[] {
  const warnings: DriftWarning[] = [];

  const db = getDb();
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map(r => r.name);
  const newTables = tables.filter(t => !KNOWN_TABLES_BASELINE.has(t));
  if (newTables.length > 0) {
    warnings.push({
      severity: 'info',
      message: `레지스트리 기준선 이후 새 테이블 ${newTables.length}개 감지(${newTables.slice(0, 5).join(', ')}${newTables.length > 5 ? ' 외' : ''}) — DB 전체 백업에 자동으로 포함되므로 조치 불필요, 확인용 정보입니다.`,
    });
  }

  const dataDir = path.join(getAppRootDir(), 'data');
  if (fs.existsSync(dataDir)) {
    const subdirs = fs.readdirSync(dataDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    const unknown = subdirs.filter(d => !KNOWN_DATA_SUBDIRS.has(d));
    for (const d of unknown) {
      warnings.push({
        severity: 'warning',
        message: `새 저장소가 감지되었습니다: data/${d} — 현재 Backup Scope(uploads, backups)에 포함되지 않았을 수 있습니다. 확인이 필요합니다.`,
      });
    }
  }

  return warnings;
}
