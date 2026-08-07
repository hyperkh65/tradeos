import { createClient, WebDAVClient } from 'webdav';

let _client: WebDAVClient | null = null;

function getClient(): WebDAVClient {
  if (!_client) {
    _client = createClient(process.env.NAS_WEBDAV_URL ?? '', {
      username: process.env.NAS_USERNAME ?? '',
      password: process.env.NAS_PASSWORD ?? '',
    });
  }
  return _client;
}

const BASE = (process.env.NAS_BASE_PATH ?? '/TradeOS').replace(/\/$/, '');

export type NasUploadResult = {
  success: boolean;
  path?: string;
  error?: string;
};

export async function nasUpload(
  remotePath: string,
  buffer: Buffer,
  contentType = 'application/octet-stream'
): Promise<NasUploadResult> {
  const fullPath = `${BASE}/${remotePath}`.replace(/\/+/g, '/');
  try {
    const client = getClient();
    // Ensure parent directories exist
    const parts = fullPath.split('/');
    const dirPath = parts.slice(0, -1).join('/');
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

export async function nasDownload(remotePath: string): Promise<Buffer | null> {
  try {
    const client = getClient();
    const data = await client.getFileContents(remotePath);
    return Buffer.from(data as ArrayBuffer);
  } catch (err) {
    console.error('[NAS] Download failed:', err);
    return null;
  }
}

export async function nasEnsureDir(dirPath: string): Promise<void> {
  const client = getClient();
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      const exists = await client.exists(current);
      if (!exists) {
        await client.createDirectory(current);
      }
    } catch {
      // ignore; directory may already exist
    }
  }
}

export async function nasExists(remotePath: string): Promise<boolean> {
  try {
    return await getClient().exists(remotePath);
  } catch {
    return false;
  }
}

export async function nasDelete(remotePath: string): Promise<boolean> {
  try {
    await getClient().deleteFile(remotePath);
    return true;
  } catch {
    return false;
  }
}

/** Build canonical NAS path for an entity type */
export function buildNasPath(
  type: 'po' | 'inspection' | 'shipment' | 'import' | 'claim' | 'company' | 'product' | 'general',
  businessId: string,
  fileName: string
): string {
  const year = new Date().getFullYear();
  const folderMap = {
    po: `발주/${year}/${businessId}`,
    inspection: `검품/${year}/${businessId}`,
    shipment: `선적/${year}/${businessId}`,
    import: `수입/${year}/${businessId}`,
    claim: `클레임/${businessId}`,
    company: `거래처/${businessId}`,
    product: `제품/${businessId}`,
    general: `사내공유`,
  };
  const folder = folderMap[type] ?? 'etc';
  return `${folder}/${fileName}`;
}

export async function nasHealthCheck(): Promise<boolean> {
  try {
    const client = getClient();
    await client.getDirectoryContents(BASE);
    return true;
  } catch {
    return false;
  }
}
