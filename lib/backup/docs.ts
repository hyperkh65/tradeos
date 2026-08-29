import type { SystemManifest } from './manifest';
import { listSystemChanges } from './change-log';
import { getSourceOfTruthRegistry } from './registry';
import type { AttachmentAuditResult } from './attachments';

const AUTO_GEN_NOTICE = '> 이 문서는 백업 시점의 System Manifest에서 자동 생성됩니다. 수동으로 편집한 내용은 다음 백업 때 덮어써집니다.\n';

export function generateSystemArchitectureMd(m: SystemManifest): string {
  return [
    `# SYSTEM_ARCHITECTURE.md`, '', AUTO_GEN_NOTICE, '',
    `생성 시각: ${m.createdAt}`,
    '',
    '## 개요',
    'YNK 그룹웨어는 Next.js 애플리케이션(메인 앱은 Docker 없이 Synology NAS 호스트에서 `node server.js`로 직접 실행)과, ',
    '두 개의 Docker 사이드카(Qdrant 벡터 검색, docverify 문서 검증)로 구성된다.',
    '',
    '## 버전',
    `- 애플리케이션 버전(package.json): ${m.groupwareVersion.packageVersion ?? '알 수 없음'}`,
    `- Git commit: ${m.groupwareVersion.gitCommit ?? '알 수 없음'}`,
    `- Git branch: ${m.groupwareVersion.gitBranch ?? '알 수 없음'}`,
    '',
    '## 도메인',
    `- ${m.domain}`,
    '',
    '## 필요 포트',
    m.requiredPorts.map(p => `- ${p}`).join('\n'),
    '',
    '## 외부 의존성',
    m.externalDependencies.map(d => `- ${d}`).join('\n'),
  ].join('\n');
}

export function generateDatabaseSchemaMd(m: SystemManifest): string {
  const rows = Object.entries(m.schemaVersion.recordCounts).sort((a, b) => a[0].localeCompare(b[0]));
  return [
    `# DATABASE_SCHEMA.md`, '', AUTO_GEN_NOTICE, '',
    `- Database Type: ${m.databaseType}`,
    `- Database Engine Version: ${m.databaseVersion}`,
    `- 테이블 수: ${m.schemaVersion.tableCount}`,
    '',
    '## 테이블별 레코드 수',
    '| 테이블 | 레코드 수 |', '|---|---|',
    ...rows.map(([t, n]) => `| ${t} | ${n} |`),
  ].join('\n');
}

export function generateStorageStructureMd(m: SystemManifest, attachmentAudit: AttachmentAuditResult): string {
  return [
    `# STORAGE_STRUCTURE.md`, '', AUTO_GEN_NOTICE, '',
    '## 저장 경로',
    `- Database: \`${m.storagePaths.database}\``,
    `- 첨부파일: \`${m.storagePaths.uploads}\``,
    `- Qdrant 볼륨: \`${m.storagePaths.qdrant ?? '알 수 없음(Docker 정보 없음)'}\``,
    '',
    '## 첨부파일 무결성',
    `- 전체 파일 수: ${attachmentAudit.totalFiles}`,
    `- DB 참조 발견 수: ${attachmentAudit.totalDbFileReferences}`,
    `- Orphan(파일은 있으나 DB 참조 없음): ${attachmentAudit.orphanFiles.length}`,
    `- Missing(DB 참조는 있으나 파일 없음): ${attachmentAudit.missingReferences.length}`,
  ].join('\n');
}

export function generateDockerArchitectureMd(m: SystemManifest): string {
  return [
    `# DOCKER_ARCHITECTURE.md`, '', AUTO_GEN_NOTICE, '',
    `Docker 사용 가능: ${m.docker.available ? '예' : '아니오(백업 시점에 확인 불가)'}`,
    m.docker.dockerVersion ? `Docker 버전: ${m.docker.dockerVersion}` : '',
    '',
    '## 컨테이너',
    ...m.docker.containers.map(c => [
      `### ${c.name}`,
      `- Image: ${c.image}`,
      `- Status: ${c.status}`,
      `- Ports: ${c.ports.join(', ') || '(없음)'}`,
      `- Volumes: ${c.volumes.join(', ') || '(없음)'}`,
    ].join('\n')),
  ].join('\n');
}

export function generateAiArchitectureMd(m: SystemManifest): string {
  return [
    `# AI_ARCHITECTURE.md`, '', AUTO_GEN_NOTICE, '',
    '## 활성 Qdrant 컬렉션',
    `- 이름: ${m.qdrant.collectionName ?? '없음'}`,
    `- Embedding 모델: ${m.qdrant.embeddingModel ?? '없음'}`,
    `- 벡터 차원: ${m.qdrant.vectorDimension ?? '알 수 없음'}`,
    `- 상태: ${m.qdrant.status ?? '알 수 없음'}`,
    '',
    'Qdrant snapshot 복원이 실패하거나 없는 경우, 원본 그룹웨어 DB/NAS 자료를 기준으로',
    '`/api/ai/index/reindex-all`(또는 임베딩 모델이 바뀐 경우 `/api/ai/index/migrate-embedding`)을',
    '호출해 전체 재인덱싱할 수 있다 — Qdrant는 항상 두 복구 경로(Snapshot Restore, Full Rebuild)를 갖는다.',
  ].join('\n');
}

export function generateExternalDependenciesMd(m: SystemManifest): string {
  const registry = getSourceOfTruthRegistry();
  return [
    `# EXTERNAL_DEPENDENCIES.md`, '', AUTO_GEN_NOTICE, '',
    '## Source of Truth 레지스트리',
    '| 도메인 | Source of Truth | 백업 방식 | 비고 |', '|---|---|---|---|',
    ...registry.map(d => `| ${d.label} | ${d.sourceOfTruth} | ${d.backedUpBy} | ${d.notes ?? ''} |`),
    '',
    '## 외부 서비스',
    ...m.externalDependencies.map(d => `- ${d}`),
  ].join('\n');
}

export function generateBackupContentsMd(m: SystemManifest): string {
  return [
    `# BACKUP_CONTENTS.md`, '', AUTO_GEN_NOTICE, '',
    `Backup ID: ${m.backupId}`,
    `생성 시각: ${m.createdAt}`,
    `Backup Format Version: ${m.backupFormatVersion}`,
    '',
    '## 포함된 것',
    '- /database — SQLite 전체 덤프',
    '- /files — 첨부파일 전체(체크섬 포함)',
    '- /qdrant — Qdrant snapshot(가능한 경우)',
    '- /application — package.json/lock, next.config, BUILD_INFO.json',
    '- /docker — 합성 docker-compose.yml, 오프라인 이미지 아카이브(가능한 경우)',
    '- /config — AI/시스템 설정 (DB dump에 포함되어 별도 파일 아님)',
    '- /secrets — 암호화된 secrets.enc(Recovery Password로만 복호화 가능)',
    '- /documentation — 이 문서들 전체',
    '- /recovery — restore.sh, preflight.sh, verify.sh, change-domain.sh',
  ].join('\n');
}

export function generateRestoreGuideMd(m: SystemManifest): string {
  return [
    `# RESTORE_GUIDE.md`, '', AUTO_GEN_NOTICE, '',
    '## 최소 필요 입력',
    '1. 새 NAS 관리자 계정',
    '2. (도메인이 바뀐 경우) 새 도메인',
    '3. Recovery Password(secrets.enc 복호화용)',
    '',
    '## 절차',
    '1. `recovery/preflight.sh` 실행 — NAS 환경 점검',
    '2. `recovery/restore.sh` 실행 — DB/첨부파일/애플리케이션/Qdrant/시크릿 복원',
    '3. (도메인이 바뀐 경우) `recovery/change-domain.sh <새도메인>` 실행',
    '4. `recovery/verify.sh` 실행 — 복원 검증, RESTORE_REPORT 생성',
    '',
    '## 자동화되지 않는 것',
    '- DNS/도메인 등록기관 변경',
    '- SSL 신규 발급(DNS 검증 필요)',
    '- Cloudflare/Notion/SMTP 계정 자체가 사라진 경우의 재가입',
    '- Synology 패키지 자동 설치(감지 + 안내까지만 지원)',
    '',
    `(이 문서 생성 시점 활성 도메인: ${m.domain})`,
  ].join('\n');
}

export function generateChangeHistoryMd(): string {
  const changes = listSystemChanges();
  return [
    `# CHANGE_HISTORY.md`, '', AUTO_GEN_NOTICE, '',
    ...changes.map(c => `- **${c.occurredAt.slice(0, 10)}** [${c.category}] ${c.summary}${c.details ? ` — ${c.details}` : ''}`),
  ].join('\n');
}

export function generateAllDocs(m: SystemManifest, attachmentAudit: AttachmentAuditResult): Record<string, string> {
  return {
    'SYSTEM_ARCHITECTURE.md': generateSystemArchitectureMd(m),
    'DATABASE_SCHEMA.md': generateDatabaseSchemaMd(m),
    'STORAGE_STRUCTURE.md': generateStorageStructureMd(m, attachmentAudit),
    'DOCKER_ARCHITECTURE.md': generateDockerArchitectureMd(m),
    'AI_ARCHITECTURE.md': generateAiArchitectureMd(m),
    'EXTERNAL_DEPENDENCIES.md': generateExternalDependenciesMd(m),
    'BACKUP_CONTENTS.md': generateBackupContentsMd(m),
    'RESTORE_GUIDE.md': generateRestoreGuideMd(m),
    'CHANGE_HISTORY.md': generateChangeHistoryMd(),
  };
}
