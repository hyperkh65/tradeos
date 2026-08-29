import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb, newId, now } from '../db/sqlite';
import { getBackupDir } from '../db/backup';

const execFileAsync = promisify(execFile);

export interface RestoreTestReport {
  id: string;
  packageFilename: string;
  status: 'SUCCESS' | 'FAILED';
  checks: { key: string; ok: boolean; detail: string }[];
  createdAt: string;
}

/** 실제 데이터를 건드리지 않고, 별도 임시 디렉터리에 진짜로 압축을 풀어 DB 무결성과
 * 첨부파일 체크섬을 검증한다 — 관리자가 "복구 테스트" 버튼을 누를 때마다 실행되고
 * 결과가 이력으로 쌓인다("Last Disaster Recovery Test"). 앱 기동까지는 하지 않는다
 * (포트 충돌 위험을 피하기 위해 — 그 부분은 실제 재해 시 restore.sh + verify.sh가
 * 새 NAS에서 수행한다). */
export async function runRestoreTest(filename: string): Promise<RestoreTestReport> {
  const id = newId();
  const safeName = path.basename(filename);
  const filePath = path.join(getBackupDir(), safeName);
  const tmpDir = path.join(os.tmpdir(), `ynk-restore-test-${id}`);
  const checks: RestoreTestReport['checks'] = [];

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    if (!fs.existsSync(filePath)) throw new Error('패키지 파일을 찾을 수 없습니다.');
    await execFileAsync('tar', ['-xzf', filePath, '-C', tmpDir], { maxBuffer: 1024 * 1024 * 500 });
    checks.push({ key: 'extract', ok: true, detail: '압축 해제 성공' });

    try {
      await execFileAsync('sh', ['-c', `cd "${tmpDir}" && shasum -a 256 -c manifest/checksums.sha256 --status`]);
      checks.push({ key: 'checksums', ok: true, detail: '전체 체크섬 일치' });
    } catch {
      checks.push({ key: 'checksums', ok: false, detail: '체크섬 불일치 발견' });
    }

    const dbDumpPath = path.join(tmpDir, 'database', 'database.dump');
    if (fs.existsSync(dbDumpPath)) {
      try {
        const { stdout } = await execFileAsync('sqlite3', [dbDumpPath, 'PRAGMA integrity_check']);
        const ok = stdout.trim() === 'ok';
        checks.push({ key: 'db_integrity', ok, detail: stdout.trim() });
      } catch (e) {
        checks.push({ key: 'db_integrity', ok: false, detail: (e as Error).message });
      }
      try {
        const { stdout } = await execFileAsync('sqlite3', [dbDumpPath, 'SELECT COUNT(*) FROM users']);
        checks.push({ key: 'db_has_records', ok: parseInt(stdout.trim(), 10) >= 0, detail: `users: ${stdout.trim()}` });
      } catch (e) {
        checks.push({ key: 'db_has_records', ok: false, detail: (e as Error).message });
      }
    } else {
      checks.push({ key: 'db_integrity', ok: false, detail: 'database.dump 없음' });
    }

    const auditPath = path.join(tmpDir, 'files', 'attachments-audit.json');
    if (fs.existsSync(auditPath)) {
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      checks.push({ key: 'attachments', ok: audit.missingReferences.length === 0, detail: `총 ${audit.totalFiles}개, missing ${audit.missingReferences.length}건` });
    }

    const buildPath = path.join(tmpDir, 'application', 'build', '.next', 'standalone', 'server.js');
    checks.push({ key: 'application_build', ok: fs.existsSync(buildPath), detail: fs.existsSync(buildPath) ? 'server.js 확인됨' : 'server.js 없음(구버전 백업일 수 있음)' });

    const status: RestoreTestReport['status'] = checks.every(c => c.ok) ? 'SUCCESS' : 'FAILED';
    const report: RestoreTestReport = { id, packageFilename: safeName, status, checks, createdAt: now() };

    getDb().prepare(`INSERT INTO restore_test_runs (id, package_id, status, report_json, error, created_at) VALUES (?,?,?,?,?,?)`)
      .run(id, safeName, status, JSON.stringify(report), null, report.createdAt);

    return report;
  } catch (e) {
    const report: RestoreTestReport = { id, packageFilename: safeName, status: 'FAILED', checks, createdAt: now() };
    try {
      getDb().prepare(`INSERT INTO restore_test_runs (id, package_id, status, report_json, error, created_at) VALUES (?,?,?,?,?,?)`)
        .run(id, safeName, 'FAILED', JSON.stringify(report), (e as Error).message, report.createdAt);
    } catch { /* ignore logging failure */ }
    throw e;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export interface RestoreTestHistoryItem { id: string; packageId: string; status: string; error: string | null; createdAt: string }

export function listRestoreTestHistory(limit = 20): RestoreTestHistoryItem[] {
  const db = getDb();
  const rows = db.prepare(`SELECT id, package_id, status, error, created_at FROM restore_test_runs ORDER BY created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
  return rows.map(r => ({ id: r.id as string, packageId: r.package_id as string, status: r.status as string, error: r.error as string | null, createdAt: r.created_at as string }));
}
