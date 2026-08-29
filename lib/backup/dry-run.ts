import { execFileSync } from 'child_process';
import path from 'path';
import { getBackupDir } from '../db/backup';

export interface DryRunCheck { key: string; label: string; ok: boolean }
export interface DryRunResult { filename: string; manifestFound: boolean; checks: DryRunCheck[]; overallOk: boolean }

/** 실제로 압축을 풀지 않고 tar 목차 + manifest만 읽어서 "복구 가능성"을 빠르게
 * 확인한다(요구사항 46번). */
export function dryRunCheckPackage(filename: string): DryRunResult {
  const safeName = path.basename(filename);
  const filePath = path.join(getBackupDir(), safeName);
  const listing = execFileSync('tar', ['-tzf', filePath], { maxBuffer: 1024 * 1024 * 20 }).toString().split('\n');
  const has = (p: string) => listing.includes(`./${p}`) || listing.includes(p);
  const hasPrefix = (p: string) => listing.some(l => l.startsWith(`./${p}`) || l.startsWith(p));

  const checks: DryRunCheck[] = [
    { key: 'database', label: 'DB', ok: has('database/database.dump') },
    { key: 'attachments', label: 'Attachments', ok: hasPrefix('files/attachments/') || has('files/attachments-audit.json') },
    { key: 'application', label: 'Application', ok: hasPrefix('application/build/.next/standalone/') },
    { key: 'secrets', label: 'Secrets', ok: has('secrets/secrets.enc') },
    { key: 'qdrant', label: 'Qdrant', ok: hasPrefix('qdrant/snapshots/') && listing.some(l => l.endsWith('.snapshot')) },
    { key: 'docker', label: 'Docker', ok: has('docker/docker-compose.yml') },
    { key: 'migrations', label: 'Migration', ok: has('database/database.dump') }, // DB dump 자체에 스키마 전체 포함
    { key: 'documentation', label: 'Documentation', ok: has('documentation/RESTORE_GUIDE.md') },
    { key: 'checksums', label: 'Checksums', ok: has('manifest/checksums.sha256') },
  ];

  let manifestFound = false;
  try {
    execFileSync('tar', ['-xzf', filePath, '-O', './manifest/system-manifest.json'], { maxBuffer: 1024 * 1024 * 20 });
    manifestFound = true;
  } catch { manifestFound = false; }

  // secrets/qdrant는 없어도(WARNING 상태 백업일 수 있음) "복구 불가능"은 아니므로
  // 필수(critical)로 취급하지 않는다 — database/application/checksums만 필수.
  const criticalKeys = new Set(['database', 'application', 'checksums']);
  const overallOk = checks.filter(c => criticalKeys.has(c.key)).every(c => c.ok) && manifestFound;

  return { filename: safeName, manifestFound, checks, overallOk };
}
