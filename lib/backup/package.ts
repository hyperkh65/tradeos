import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb, newId, now } from '../db/sqlite';
import { getBackupDir, getAppRootDir } from '../db/backup';
import { generateManifest, type SystemManifest } from './manifest';
import { auditAttachments, getUploadDir } from './attachments';
import { generateAllDocs } from './docs';
import { collectSecrets, getStoredRecoveryPasswordForAutoBackup } from './secrets';
import { collectNonSecretConfig } from './app-config';
import { encryptVault } from './vault';
import { backupQdrantSnapshot } from './qdrant-backup';
import { locateApplicationArtifacts } from './application';
import { synthesizeDockerCompose } from './docker';

const execFileAsync = promisify(execFile);

export type PackageStatus = 'SUCCESS' | 'WARNING' | 'FAILED';

export interface PackageResult {
  id: string;
  filename: string;
  sizeBytes: number;
  status: PackageStatus;
  encrypted: boolean;
  warnings: string[];
  errors: string[];
  manifest: SystemManifest | null;
}

const STAGING_SUBDIRS = ['manifest', 'database', 'files', 'qdrant', 'application', 'docker', 'config', 'secrets', 'documentation', 'recovery'];

function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function computeChecksumsFile(stagingDir: string): string {
  const lines: string[] = [];
  for (const rel of walkFiles(stagingDir).sort()) {
    const buf = fs.readFileSync(path.join(stagingDir, rel));
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    lines.push(`${hash}  ${rel}`);
  }
  return lines.join('\n') + '\n';
}

/** 요구사항 38번 "Backup 완료 조건" 체크리스트 — 하나라도 critical failure면 SUCCESS로
 * 표시하지 않는다. */
function checkCompleteness(stagingDir: string, ctx: { encrypted: boolean; hasQdrant: boolean }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const must = [
    ['database/database.dump', 'Database dump'],
    ['manifest/system-manifest.json', 'System manifest'],
    ['manifest/checksums.sha256', 'Checksums'],
    ['application/package.json', 'Application artifact(package.json)'],
    ['documentation/RESTORE_GUIDE.md', 'Documentation'],
  ] as const;
  for (const [rel, label] of must) {
    if (!fs.existsSync(path.join(stagingDir, rel))) errors.push(`${label}이(가) 없습니다(${rel}).`);
  }
  if (!ctx.encrypted) warnings.push('Recovery Password가 설정되지 않아 secrets.enc가 포함되지 않았습니다.');
  if (!ctx.hasQdrant) warnings.push('Qdrant snapshot을 포함하지 못했습니다 — 복원 시 전체 재인덱싱(Full Rebuild)이 필요합니다.');
  return { errors, warnings };
}

export async function createCompleteRecoveryPackage(
  triggeredBy: string,
  opts?: { password?: string },
): Promise<PackageResult> {
  const id = newId();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });
  const stagingDir = path.join(backupDir, `.tmp-pkg-${id}`);
  const warnings: string[] = [];
  const errors: string[] = [];
  let manifest: SystemManifest | null = null;
  let encrypted = false;

  const cleanupStaging = () => { try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ } };

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const sub of STAGING_SUBDIRS) fs.mkdirSync(path.join(stagingDir, sub), { recursive: true });

    // 1) DB — better-sqlite3 내장 WAL-safe consistent backup(기존 lib/db/backup.ts와 동일 방식)
    const db = getDb();
    await db.backup(path.join(stagingDir, 'database', 'database.dump'));

    // 2) 첨부파일 — 원본 디렉터리 구조 그대로 복사 + 무결성 감사 결과 동봉
    const audit = auditAttachments();
    const uploadDir = getUploadDir();
    if (fs.existsSync(uploadDir) && fs.readdirSync(uploadDir).length > 0) {
      await execFileAsync('cp', ['-R', uploadDir, path.join(stagingDir, 'files', 'attachments')]);
    }
    fs.writeFileSync(path.join(stagingDir, 'files', 'attachments-audit.json'), JSON.stringify(audit, null, 2));
    if (audit.missingReferences.length > 0) {
      warnings.push(`DB에 참조는 있으나 실제 파일이 없는 첨부 ${audit.missingReferences.length}건 발견(files/attachments-audit.json 참고)`);
    }

    // 3) Qdrant snapshot(실패해도 계속 진행 — Full Rebuild 대체 경로가 있음)
    const qdrantResult = await backupQdrantSnapshot(path.join(stagingDir, 'qdrant', 'snapshots'));
    fs.writeFileSync(path.join(stagingDir, 'qdrant', 'snapshot-result.json'), JSON.stringify(qdrantResult, null, 2));

    // 4) 애플리케이션 — "패키지 하나만 있으면 된다"를 실제로 만족하려면 컴파일된
    //    standalone 빌드 자체가 패키지 안에 있어야 한다(참조 파일만 넣으면 복원 시
    //    인터넷으로 npm install/build가 필요해져 오프라인 복구가 안 됨). 기존
    //    runFullAppBackup()과 같은 소스 경로를 재사용하되, data/는 여기서 중복 포함하지
    //    않는다(DB는 /database에 dump로, 첨부파일은 /files에 체크섬과 함께 이미 더
    //    안전하게 포함됨).
    const appRoot = getAppRootDir();
    const buildTargets = ['.next/standalone', '.next/static', 'public'].filter(t => fs.existsSync(path.join(appRoot, t)));
    const buildDestDir = path.join(stagingDir, 'application', 'build');
    fs.mkdirSync(buildDestDir, { recursive: true });
    for (const t of buildTargets) {
      const dest = path.join(buildDestDir, t);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); // t가 ".next/standalone"처럼 하위경로면 부모(.next)가 먼저 있어야 cp -R이 됨
      await execFileAsync('cp', ['-R', path.join(appRoot, t), dest], { maxBuffer: 1024 * 1024 * 50 });
    }
    if (buildTargets.length === 0) warnings.push('컴파일된 애플리케이션 빌드(.next/standalone)를 찾지 못했습니다 — 개발 환경에서 백업하면 정상입니다(프로덕션 NAS에서는 항상 존재).');

    const appArtifacts = locateApplicationArtifacts();
    for (const p of Object.values(appArtifacts)) {
      if (p) fs.copyFileSync(p, path.join(stagingDir, 'application', path.basename(p)));
    }

    // 5) Docker — 합성 compose(정보는 manifest 생성 시 docker inspect 결과를 재사용)
    const preManifest = generateManifest(id); // docker 정보 포함, 아래서 최종 manifest로 다시 씀(문서/체크섬 반영 위해)
    const compose = synthesizeDockerCompose(preManifest.docker.containers.map(c => ({ name: c.name, image: c.image, ports: c.ports, volumes: c.volumes })));
    fs.writeFileSync(path.join(stagingDir, 'docker', 'docker-compose.yml'), compose);

    // 5.5) 민감하지 않은 설정(Notion DB ID 등) — 암호화 불필요, 앱 재기동에 필수
    fs.writeFileSync(path.join(stagingDir, 'config', 'application-config.json'), JSON.stringify(collectNonSecretConfig(), null, 2));

    // 6) Secrets — Recovery Password가 설정돼 있을 때만 포함(평문 폴백 절대 금지)
    const password = opts?.password || getStoredRecoveryPasswordForAutoBackup();
    if (password) {
      const secrets = collectSecrets();
      const blob = encryptVault(secrets, password);
      fs.writeFileSync(path.join(stagingDir, 'secrets', 'secrets.enc'), JSON.stringify(blob));
      encrypted = true;
    }

    // 7) 최종 manifest(위 산출물들을 다 반영한 뒤 다시 생성 — auditAttachments/qdrant 등은
    //    이미 완료된 상태라 manifest 안의 attachmentCount 등이 실제와 일치함)
    manifest = generateManifest(id);
    fs.writeFileSync(path.join(stagingDir, 'manifest', 'system-manifest.json'), JSON.stringify(manifest, null, 2));

    // 8) 문서
    const docs = generateAllDocs(manifest, audit);
    for (const [name, content] of Object.entries(docs)) fs.writeFileSync(path.join(stagingDir, 'documentation', name), content);

    // 9) 복구 스크립트(Phase 11에서 실제 내용 채움 — 있으면 그대로 복사)
    const recoveryScriptsDir = path.join(process.cwd(), 'recovery');
    if (fs.existsSync(recoveryScriptsDir)) {
      await execFileAsync('cp', ['-R', recoveryScriptsDir + '/.', path.join(stagingDir, 'recovery')]);
    } else {
      fs.writeFileSync(path.join(stagingDir, 'recovery', 'README.md'), '복구 스크립트가 아직 이 버전의 백업 시스템에 포함되지 않았습니다.\n');
    }

    // 10) 체크섬(모든 산출물이 갖춰진 뒤 마지막에 계산)
    fs.writeFileSync(path.join(stagingDir, 'manifest', 'checksums.sha256'), computeChecksumsFile(stagingDir));

    // 11) 완료 조건 검사
    const completeness = checkCompleteness(stagingDir, { encrypted, hasQdrant: qdrantResult.ok });
    errors.push(...completeness.errors);
    warnings.push(...completeness.warnings);
    if (errors.length > 0) throw new Error(errors.join(' / '));

    // 12) tar로 묶고 .tmp → 검증 → atomic rename(요구사항 19번)
    const finalFilename = `YNK_FULL_BACKUP_${ts}.tar.gz`;
    const tmpTarPath = path.join(backupDir, `.tmp-${id}.tar.gz`);
    await execFileAsync('tar', ['-czf', tmpTarPath, '-C', stagingDir, '.'], { maxBuffer: 1024 * 1024 * 200 });
    if (!fs.existsSync(tmpTarPath) || fs.statSync(tmpTarPath).size === 0) throw new Error('tar 압축 결과가 비어 있습니다.');
    const sizeBytes = fs.statSync(tmpTarPath).size;
    const finalPath = path.join(backupDir, finalFilename);
    fs.renameSync(tmpTarPath, finalPath); // 같은 파일시스템 내 rename은 atomic

    const status: PackageStatus = warnings.length > 0 ? 'WARNING' : 'SUCCESS';
    db.prepare(`INSERT INTO backup_packages (id, filename, size_bytes, triggered_by, status, encrypted, manifest_json, coverage_json, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, finalFilename, sizeBytes, triggeredBy, status, encrypted ? 1 : 0, JSON.stringify(manifest), JSON.stringify({ warnings, errors }), null, now());

    return { id, filename: finalFilename, sizeBytes, status, encrypted, warnings, errors, manifest };
  } catch (e) {
    const message = (e as Error).message;
    try {
      getDb().prepare(`INSERT INTO backup_packages (id, filename, size_bytes, triggered_by, status, encrypted, manifest_json, coverage_json, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id, `YNK_FULL_BACKUP_${ts}.tar.gz`, 0, triggeredBy, 'FAILED', encrypted ? 1 : 0, manifest ? JSON.stringify(manifest) : null, JSON.stringify({ warnings, errors }), message, now());
    } catch { /* ignore logging failure */ }
    throw e;
  } finally {
    cleanupStaging();
  }
}

export interface BackupPackageListItem {
  id: string; filename: string; sizeBytes: number; triggeredBy: string; status: PackageStatus | string;
  encrypted: boolean; error: string | null; createdAt: string; existsOnDisk: boolean;
}

export function listCompleteRecoveryPackages(): BackupPackageListItem[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM backup_packages ORDER BY created_at DESC LIMIT 50`).all() as Record<string, unknown>[];
  const dir = getBackupDir();
  return rows.map(r => ({
    id: r.id as string, filename: r.filename as string, sizeBytes: r.size_bytes as number,
    triggeredBy: r.triggered_by as string, status: r.status as string, encrypted: !!r.encrypted,
    error: r.error as string | null, createdAt: r.created_at as string,
    existsOnDisk: fs.existsSync(path.join(dir, r.filename as string)),
  }));
}

/** 요구사항 18번: 최근 N개는 그대로 두고, 그 밖의 것들 중에서는 달마다 가장 최근 것
 * 하나씩만 "월간 아카이브"로 별도 보존한다. FAILED 백업은 애초에 보존 대상이 아니므로
 * (검증 실패라 가치가 없음) 즉시 정리 대상이다. 이제 막 만든 백업(COMPLETE 검증 통과)
 * 이후에만 호출되므로, 정리 도중 정상 백업이 사라지는 일은 없다(요구사항 19). */
export function pruneCompletePackages(retainCount: number, monthlyArchiveCount: number): { deleted: number } {
  const db = getDb();
  const backupDir = getBackupDir();
  const all = listCompleteRecoveryPackages()
    .filter(p => p.status !== 'FAILED')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const keepIds = new Set<string>();
  for (const p of all.slice(0, Math.max(0, retainCount))) keepIds.add(p.id);

  const seenMonths = new Set<string>();
  for (const p of all) {
    if (keepIds.has(p.id)) continue;
    const month = p.createdAt.slice(0, 7);
    if (seenMonths.has(month) || seenMonths.size >= monthlyArchiveCount) continue;
    seenMonths.add(month);
    keepIds.add(p.id);
  }

  let deleted = 0;
  for (const p of all) {
    if (keepIds.has(p.id)) continue;
    try { fs.unlinkSync(path.join(backupDir, p.filename)); } catch { /* 이미 없을 수 있음 */ }
    db.prepare(`DELETE FROM backup_packages WHERE id=?`).run(p.id);
    deleted++;
  }
  // FAILED 백업도 목록에서 정리(파일은 애초에 만들어지지 않았거나 롤백됨)
  db.prepare(`DELETE FROM backup_packages WHERE status='FAILED' AND created_at < datetime('now','-7 days')`).run();
  return { deleted };
}
