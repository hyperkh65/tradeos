import fs from 'fs';
import path from 'path';
import { getDb, now } from '../db/sqlite';
import { encryptPassword, decryptPassword } from '../mail/crypto';
import { listProviders } from '../ai/db';
import { getAISettings } from '../ai/db';
import { getAppRootDir } from '../db/backup';
import { detectExternalDrives, getSelectedBackupDriveUuid } from './drive-detect';

function ensureSettingsTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
}

const RECOVERY_PW_KEY = 'backup_recovery_password_wrapped';

/**
 * Recovery Password 자체는 평문으로 저장하지 않는다 — 다만 매일 새벽 스케줄러가 관리자
 * 개입 없이 자동으로 암호화된 Complete Package를 만들 수 있어야 하므로, 기존
 * lib/mail/crypto.ts(AUTH_SECRET 파생 키)로 한 번 감싸서 DB에 보관한다. 이건 "편의용
 * 사본"이고, 진짜 재해복구 수단은 관리자가 별도 보관하는 인쇄된 YNK-RECOVERY-KEY.txt다 —
 * AUTH_SECRET 자체가 유실되면 이 wrapped 사본도 무의미해지지만, 그 경우에도 오프라인
 * 보관한 원본 Recovery Password로 secrets.enc를 직접 열 수 있다(vault.ts는 AUTH_SECRET을
 * 전혀 몰라도 동작함).
 */
export function setRecoveryPassword(password: string): void {
  if (!password || password.length < 8) throw new Error('Recovery Password는 최소 8자 이상이어야 합니다.');
  ensureSettingsTable();
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
    .run(RECOVERY_PW_KEY, encryptPassword(password), now());
}

export function hasRecoveryPassword(): boolean {
  ensureSettingsTable();
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(RECOVERY_PW_KEY) as { value: string } | undefined;
  return !!row;
}

/** 스케줄러(자동 백업)만 사용한다 — 관리자가 매번 입력할 필요 없이 자동 암호화하기 위함. */
export function getStoredRecoveryPasswordForAutoBackup(): string | null {
  ensureSettingsTable();
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(RECOVERY_PW_KEY) as { value: string } | undefined;
  if (!row) return null;
  try { return decryptPassword(row.value); } catch { return null; }
}

export interface CollectedSecrets {
  authSecret: string | null;
  notionToken: string | null;
  mail: { smtpHost: string | null; smtpPort: string | null; imapHost: string | null; imapPort: string | null; username: string | null; password: string | null };
  nas: { webdavUrl: string | null; username: string | null; password: string | null; basePath: string | null; publicBaseUrl: string | null };
  qdrantApiKey: string | null;
  aiProviders: { id: string; name: string; providerType: string; accountId: string | null; apiToken: string | null; baseUrl: string | null; chatModel: string | null; embeddingModel: string | null }[];
}

/** 백업 시점에 process.env + DB에서 직접 읽는다 — 어딘가에 별도로 캐시해두지 않는다. */
export function collectSecrets(): CollectedSecrets {
  const aiSettings = getAISettings(); // 이미 복호화된 qdrantApiKey 포함
  const providers = listProviders(); // 이미 복호화된 apiToken 포함
  return {
    authSecret: process.env.AUTH_SECRET || null,
    notionToken: process.env.NOTION_TOKEN || null,
    mail: {
      smtpHost: process.env.MAIL_SMTP_HOST || null, smtpPort: process.env.MAIL_SMTP_PORT || null,
      imapHost: process.env.MAIL_IMAP_HOST || null, imapPort: process.env.MAIL_IMAP_PORT || null,
      username: process.env.MAIL_USERNAME || null, password: process.env.MAIL_PASSWORD || null,
    },
    nas: {
      webdavUrl: process.env.NAS_WEBDAV_URL || null, username: process.env.NAS_USERNAME || null,
      password: process.env.NAS_PASSWORD || null, basePath: process.env.NAS_BASE_PATH || null,
      publicBaseUrl: process.env.NAS_PUBLIC_BASE_URL || null,
    },
    qdrantApiKey: aiSettings.qdrantApiKey,
    aiProviders: providers.map(p => ({
      id: p.id, name: p.name, providerType: p.providerType, accountId: p.accountId,
      apiToken: p.apiToken, baseUrl: p.baseUrl, chatModel: p.chatModel, embeddingModel: p.embeddingModel,
    })),
  };
}

export interface RecoverySheetSaveResult {
  savedPath: string;
  location: 'other-external-drive' | 'nas-internal-volume';
  sameDeviceAsBackupDrive: boolean;
}

/** 복구 시트(YNK-RECOVERY-KEY.txt)를 브라우저 다운로드와 별개로 서버(NAS)에도 저장한다.
 * 백업이 저장되는 외장 HDD와 물리적으로 같은 장치에 두면 그 드라이브 하나만 분실/고장나도
 * 백업과 복구키를 동시에 잃으므로, 감지된 외장 드라이브가 2개 이상이면 백업 드라이브가
 * 아닌 다른 드라이브에 저장한다. 외장 드라이브가 하나뿐이면(실제 운영 NAS의 현재 구성)
 * NAS 내장 볼륨(백업이 저장되는 외장 HDD와는 별개 장치)에 저장한다 — 다만 이 경우 NAS
 * 본체 자체가 통째로 파괴되는 재해에는 이 사본도 함께 소실되므로, 관리자가 직접
 * 다운로드한 사본을 NAS 바깥(다른 위치)에도 보관하는 것을 대체하지는 못한다. */
export function saveRecoverySheetToServer(sheet: string): RecoverySheetSaveResult {
  const drives = detectExternalDrives();
  const backupDriveUuid = getSelectedBackupDriveUuid();
  const otherDrive = drives.find(d => d.uuid && d.uuid !== backupDriveUuid);

  let targetDir: string;
  let location: RecoverySheetSaveResult['location'];
  if (otherDrive) {
    targetDir = path.join(otherDrive.mountPoint, 'YNK_RECOVERY_KEY');
    location = 'other-external-drive';
  } else {
    targetDir = path.join(getAppRootDir(), 'data', 'recovery-key');
    location = 'nas-internal-volume';
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const savedPath = path.join(targetDir, 'YNK-RECOVERY-KEY.txt');
  fs.writeFileSync(savedPath, sheet, { mode: 0o600 });
  try { fs.chmodSync(savedPath, 0o600); } catch { /* 일부 파일시스템(exFAT 등)은 유닉스 권한 미지원 — 베스트에포트 */ }

  return { savedPath, location, sameDeviceAsBackupDrive: false };
}

/** manifest에는 "무엇이 있는지"만 남기고 값은 절대 넣지 않는다. */
export function secretsPresenceSummary(secrets: CollectedSecrets): Record<string, boolean | number> {
  return {
    authSecret: !!secrets.authSecret,
    notionToken: !!secrets.notionToken,
    mailCredentials: !!(secrets.mail.username && secrets.mail.password),
    nasCredentials: !!(secrets.nas.username && secrets.nas.password),
    qdrantApiKey: !!secrets.qdrantApiKey,
    aiProviderTokens: secrets.aiProviders.filter(p => !!p.apiToken).length,
  };
}
