import fs from 'fs';
import path from 'path';

// ── 로컬 파일시스템 경로 ────────────────────────────────────────────────────
// NAS_WEBDAV_URL 미설정 시 로컬 FS에 저장 (앱이 NAS에서 직접 실행될 때)
const LOCAL_UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads'
    : path.join(process.cwd(), 'data', 'uploads'));

function isWebDavConfigured(): boolean {
  return !!(process.env.NAS_WEBDAV_URL?.trim());
}

function localPath(relativePath: string): string {
  return path.join(LOCAL_UPLOAD_DIR, relativePath.replace(/^\/+/, ''));
}

// ── WebDAV (설정된 경우에만 로드) ─────────────────────────────────────────
let _webdav: { createClient: (url: string, opts: object) => unknown } | null = null;
function getWebDavModule() {
  if (!_webdav) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _webdav = require('webdav');
  }
  return _webdav!;
}

let _client: unknown | null = null;
function getClient() {
  if (!_client) {
    const { createClient } = getWebDavModule();
    _client = createClient(process.env.NAS_WEBDAV_URL ?? '', {
      username: process.env.NAS_USERNAME ?? '',
      password: process.env.NAS_PASSWORD ?? '',
    });
  }
  return _client as {
    putFileContents: (p: string, b: Buffer, opts: object) => Promise<void>;
    getFileContents: (p: string) => Promise<ArrayBuffer>;
    exists: (p: string) => Promise<boolean>;
    createDirectory: (p: string) => Promise<void>;
    deleteFile: (p: string) => Promise<void>;
    getDirectoryContents: (p: string) => Promise<unknown>;
  };
}

const BASE = (process.env.NAS_BASE_PATH ?? '/TradeOS').replace(/\/$/, '');

export type NasUploadResult = {
  success: boolean;
  path?: string;
  error?: string;
};

// ── Upload ─────────────────────────────────────────────────────────────────
export async function nasUpload(
  relativePath: string,
  buffer: Buffer,
  contentType = 'application/octet-stream'
): Promise<NasUploadResult> {
  if (!isWebDavConfigured()) {
    // 로컬 파일시스템
    try {
      const dest = localPath(relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer);
      return { success: true, path: dest };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // WebDAV
  const fullPath = `${BASE}/${relativePath}`.replace(/\/+/g, '/');
  try {
    const client = getClient();
    const dirPath = fullPath.split('/').slice(0, -1).join('/');
    await nasEnsureDir(dirPath);
    await client.putFileContents(fullPath, buffer, {
      contentLength: buffer.length,
      headers: { 'Content-Type': contentType },
      overwrite: true,
    });
    return { success: true, path: fullPath };
  } catch (err) {
    console.error('[NAS] Upload failed:', err);
    return { success: false, error: String(err) };
  }
}

// ── Download ───────────────────────────────────────────────────────────────
export async function nasDownload(storedPath: string): Promise<Buffer | null> {
  if (!isWebDavConfigured()) {
    // 로컬: storedPath가 절대경로
    try {
      return fs.readFileSync(storedPath);
    } catch (err) {
      console.error('[Local] Download failed:', err);
      return null;
    }
  }

  try {
    const client = getClient();
    const data = await client.getFileContents(storedPath);
    return Buffer.from(data as ArrayBuffer);
  } catch (err) {
    console.error('[NAS] Download failed:', err);
    return null;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
export async function nasDelete(storedPath: string): Promise<boolean> {
  if (!isWebDavConfigured()) {
    try {
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await getClient().deleteFile(storedPath);
    return true;
  } catch {
    return false;
  }
}

// ── EnsureDir (WebDAV only) ────────────────────────────────────────────────
export async function nasEnsureDir(dirPath: string): Promise<void> {
  if (!isWebDavConfigured()) return; // 로컬은 mkdirSync에서 처리
  const client = getClient();
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      const exists = await client.exists(current);
      if (!exists) await client.createDirectory(current);
    } catch { /* ignore */ }
  }
}

export async function nasExists(storedPath: string): Promise<boolean> {
  if (!isWebDavConfigured()) return fs.existsSync(storedPath);
  try { return await getClient().exists(storedPath); } catch { return false; }
}

export async function nasHealthCheck(): Promise<boolean> {
  if (!isWebDavConfigured()) {
    try {
      fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
      return true;
    } catch { return false; }
  }
  try { await getClient().getDirectoryContents(BASE); return true; } catch { return false; }
}

/** Build canonical NAS path for an entity type */
export function buildNasPath(
  type: 'po' | 'inspection' | 'shipment' | 'import' | 'claim' | 'company' | 'product' | 'general' | 'approval-doc',
  businessId: string,
  fileName: string
): string {
  const year = new Date().getFullYear();
  const folderMap: Record<string, string> = {
    po: `발주/${year}/${businessId}`,
    inspection: `검품/${year}/${businessId}`,
    shipment: `선적/${year}/${businessId}`,
    import: `수입/${year}/${businessId}`,
    claim: `클레임/${businessId}`,
    company: `거래처/${businessId}`,
    product: `제품/${businessId}`,
    general: `사내공유`,
    'approval-doc': `제품승인서/${year}/${businessId}`,
  };
  return `${folderMap[type] ?? 'etc'}/${fileName}`;
}
