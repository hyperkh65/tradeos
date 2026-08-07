import { createClient } from 'webdav';

const PROVIDER = process.env.CLOUD_BACKUP_PROVIDER ?? 'webdav';
const BASE = (process.env.CLOUD_BASE_PATH ?? '/TradeOS-Backup').replace(/\/$/, '');

type BackupJob = {
  id: string;
  nasPath: string;
  backupPath: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retries: number;
  createdAt: string;
  updatedAt: string;
};

// In-memory job queue (replace with SQLite in production)
const jobQueue = new Map<string, BackupJob>();

export function queueBackup(nasPath: string): string {
  const id = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const backupPath = nasPath.replace(/^\//, '');
  jobQueue.set(id, {
    id,
    nasPath,
    backupPath: `${BASE}/${backupPath}`,
    status: 'pending',
    retries: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

export function getBackupJob(id: string): BackupJob | undefined {
  return jobQueue.get(id);
}

export function getPendingJobs(): BackupJob[] {
  return Array.from(jobQueue.values()).filter((j) => j.status === 'pending');
}

export async function runBackupJob(jobId: string, fileBuffer: Buffer): Promise<boolean> {
  const job = jobQueue.get(jobId);
  if (!job) return false;

  job.status = 'running';
  job.updatedAt = new Date().toISOString();

  try {
    if (PROVIDER === 'webdav') {
      const client = createClient(process.env.CLOUD_WEBDAV_URL ?? '', {
        username: process.env.CLOUD_USERNAME ?? '',
        password: process.env.CLOUD_PASSWORD ?? '',
      });
      const dirPath = job.backupPath.split('/').slice(0, -1).join('/');
      try { await client.createDirectory(dirPath); } catch { /* may exist */ }
      await client.putFileContents(job.backupPath, fileBuffer, { overwrite: true });
    }
    // Add S3/other providers here in future

    job.status = 'completed';
    job.updatedAt = new Date().toISOString();
    return true;
  } catch (err) {
    console.error('[Backup] Job failed:', err);
    job.status = 'failed';
    job.retries += 1;
    job.updatedAt = new Date().toISOString();
    return false;
  }
}

export function getBackupStats() {
  const jobs = Array.from(jobQueue.values());
  return {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    running: jobs.filter((j) => j.status === 'running').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };
}
