import crypto from 'crypto';

/**
 * Recovery Password 기반 Secrets Vault — 재해 시나리오(AUTH_SECRET 자체 유실 포함)에서도
 * 독립적으로 복호화 가능해야 하므로, 기존 lib/mail/crypto.ts(AUTH_SECRET 파생 키)와는
 * 완전히 별개의 암호화 경로를 쓴다. 이 암호는 DB에 평문으로 저장하지 않는다.
 *
 * KDF는 Argon2id 대신 Node 내장 crypto.scryptSync를 쓴다 — Argon2 npm 패키지는 네이티브
 * 바이너리 빌드가 필요한데, 이 프로젝트는 Docker 없이 NAS 호스트에서 raw `node server.js`로
 * 직접 실행되므로 네이티브 모듈 설치가 배포 리스크다. scrypt는 동일하게 메모리-하드한 KDF라
 * 요구사항이 허용한 "동급 KDF"에 해당하고, 추가 의존성 없이 안전하게 쓸 수 있다.
 */

const SCRYPT_N = 1 << 17; // 128MiB급 메모리 사용 — 오프라인 무차별대입을 비싸게 만듦
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const KEY_LEN = 32; // AES-256

export interface VaultBlob {
  version: 1;
  kdf: 'scrypt';
  kdfParams: { N: number; r: number; p: number };
  salt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
  createdAt: string;
}

function deriveKey(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Buffer {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM });
}

export function encryptVault(data: unknown, password: string): VaultBlob {
  if (!password || password.length < 8) throw new Error('Recovery Password는 최소 8자 이상이어야 합니다.');
  const salt = crypto.randomBytes(16);
  const params = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  const key = deriveKey(password, salt, params);
  const iv = crypto.randomBytes(12); // GCM 표준 12바이트
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1, kdf: 'scrypt', kdfParams: params,
    salt: salt.toString('hex'), iv: iv.toString('hex'),
    authTag: authTag.toString('hex'), ciphertext: ciphertext.toString('hex'),
    createdAt: new Date().toISOString(),
  };
}

/** 비밀번호가 틀리거나 데이터가 손상되면 AES-GCM의 authTag 검증에서 예외가 나며,
 * 부분적으로 복호화된 데이터가 반환되는 일은 없다(요구사항: 안전하게 실패). */
export function decryptVault(blob: VaultBlob, password: string): unknown {
  const salt = Buffer.from(blob.salt, 'hex');
  const key = deriveKey(password, salt, blob.kdfParams);
  const iv = Buffer.from(blob.iv, 'hex');
  const authTag = Buffer.from(blob.authTag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const ciphertext = Buffer.from(blob.ciphertext, 'hex');
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('복호화에 실패했습니다 — Recovery Password가 올바르지 않거나 파일이 손상되었습니다.');
  }
}

export function verifyVaultPassword(blob: VaultBlob, password: string): boolean {
  try { decryptVault(blob, password); return true; } catch { return false; }
}
