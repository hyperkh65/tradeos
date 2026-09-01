import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getDb } from '../db/sqlite';
import { getAppRootDir } from '../db/backup';
import { getActiveVectorCollection } from '../ai/db';
import { getSourceOfTruthRegistry, detectDrift, type DriftWarning } from './registry';
import { auditAttachments } from './attachments';
import { getAppDomain } from '../config/domain';

export const BACKUP_FORMAT_VERSION = 1;

interface BuildInfo { gitCommit?: string; gitBranch?: string; buildTime?: string; packageVersion?: string }

/** BUILD_INFO.json은 GitHub Actions Build 스텝에서 생성된다(NAS엔 .git이 없어서
 * 배포된 standalone 산출물 안에서 유일하게 정확한 버전 정보를 남기는 방법) — 로컬
 * 개발 환경에는 없을 수 있으므로 그때는 git 명령을 직접 시도한다(있으면). */
function readBuildInfo(): BuildInfo {
  const buildInfoPath = path.join(getAppRootDir(), 'BUILD_INFO.json');
  if (fs.existsSync(buildInfoPath)) {
    try { return JSON.parse(fs.readFileSync(buildInfoPath, 'utf8')); } catch { /* ignore */ }
  }
  try {
    const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: getAppRootDir(), timeout: 3000 }).toString().trim();
    const gitBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: getAppRootDir(), timeout: 3000 }).toString().trim();
    return { gitCommit, gitBranch };
  } catch {
    return {};
  }
}

interface DockerContainerInfo { name: string; image: string; imageId: string; status: string; ports: string[]; volumes: string[] }

function readDockerInfo(): { available: boolean; containers: DockerContainerInfo[]; dockerVersion: string | null } {
  const dockerBin = process.env.DOCVERIFY_DOCKER_BIN || 'docker';
  try {
    const version = execFileSync(dockerBin, ['version', '--format', '{{.Server.Version}}'], { timeout: 5000 }).toString().trim();
    const containers: DockerContainerInfo[] = [];
    for (const name of ['tradeos-qdrant', 'tradeos-docverify', 'tradeos-ffmpeg']) {
      try {
        const raw = execFileSync(dockerBin, ['inspect', name], { timeout: 5000 }).toString();
        const info = JSON.parse(raw)[0];
        containers.push({
          name,
          image: info.Config?.Image || '',
          imageId: info.Image || '',
          status: info.State?.Status || 'unknown',
          ports: Object.keys(info.HostConfig?.PortBindings || {}),
          volumes: (info.Mounts || []).map((m: { Source: string; Destination: string }) => `${m.Source}:${m.Destination}`),
        });
      } catch { /* 컨테이너 없음 — 무시하고 계속 */ }
    }
    return { available: true, containers, dockerVersion: version };
  } catch {
    return { available: false, containers: [], dockerVersion: null };
  }
}

function readDatabaseInfo() {
  const db = getDb();
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map(r => r.name);
  const recordCounts: Record<string, number> = {};
  for (const t of tables) {
    try { recordCounts[t] = (db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get() as { n: number }).n; } catch { /* ignore */ }
  }
  const sqliteVersion = (db.prepare('SELECT sqlite_version() as v').get() as { v: string }).v;
  return { tables, recordCounts, sqliteVersion };
}

export interface SystemManifest {
  backupId: string;
  createdAt: string;
  backupFormatVersion: number;
  groupwareVersion: { gitCommit: string | null; gitBranch: string | null; packageVersion: string | null };
  databaseType: 'sqlite';
  databaseVersion: string;
  schemaVersion: { tableCount: number; recordCounts: Record<string, number> };
  qdrant: { collectionName: string | null; embeddingModel: string | null; vectorDimension: number | null; status: string | null };
  docker: { available: boolean; dockerVersion: string | null; containers: DockerContainerInfo[] };
  domain: string;
  storagePaths: { database: string; uploads: string; qdrant: string | null };
  attachmentCount: number;
  requiredPorts: number[];
  externalDependencies: string[];
  sourceOfTruth: ReturnType<typeof getSourceOfTruthRegistry>;
  driftWarnings: DriftWarning[];
}

export function generateManifest(backupId: string): SystemManifest {
  const buildInfo = readBuildInfo();
  const dbInfo = readDatabaseInfo();
  const docker = readDockerInfo();
  const activeCollection = getActiveVectorCollection();
  const attachmentAudit = auditAttachments();

  let packageVersion: string | null = null;
  try { packageVersion = JSON.parse(fs.readFileSync(path.join(getAppRootDir(), 'package.json'), 'utf8')).version || null; } catch { /* ignore */ }

  return {
    backupId,
    createdAt: new Date().toISOString(),
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    groupwareVersion: { gitCommit: buildInfo.gitCommit || null, gitBranch: buildInfo.gitBranch || null, packageVersion },
    databaseType: 'sqlite',
    databaseVersion: dbInfo.sqliteVersion,
    schemaVersion: { tableCount: dbInfo.tables.length, recordCounts: dbInfo.recordCounts },
    qdrant: activeCollection ? {
      collectionName: activeCollection.collectionName, embeddingModel: activeCollection.embeddingModel,
      vectorDimension: activeCollection.embeddingDimension, status: activeCollection.status,
    } : { collectionName: null, embeddingModel: null, vectorDimension: null, status: null },
    docker,
    domain: getAppDomain(),
    storagePaths: {
      database: process.env.SQLITE_DB_PATH || 'data/nexport.db',
      uploads: process.env.UPLOAD_DIR || 'data/uploads',
      qdrant: docker.containers.find(c => c.name === 'tradeos-qdrant')?.volumes[0] ?? null,
    },
    attachmentCount: attachmentAudit.totalFiles,
    requiredPorts: [3103, 6333],
    externalDependencies: ['Cloudflare Workers AI', 'Notion API', 'SMTP/IMAP Mail', 'NAS WebDAV', 'Domain Registrar/DNS'],
    sourceOfTruth: getSourceOfTruthRegistry(),
    driftWarnings: detectDrift(),
  };
}
