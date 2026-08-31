import crypto from 'crypto';

/** 외부 공유 비밀번호 해시 — lib/backup/vault.ts와 동일한 이유(네이티브 빌드 없는 NAS
 * 배포)로 Argon2 대신 Node 내장 scrypt를 쓴다. 이건 "복호화"가 아니라 로그인 비밀번호처럼
 * 단방향 해시+비교만 하면 되므로 vault.ts의 AES-GCM 암호화 없이 훨씬 단순하다. */
const SCRYPT_N = 1 << 15; // 32MiB급 — 공유 페이지 접속마다 계산되므로 vault보다 가볍게
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
// scryptSync 필요 메모리 ≈ 128*N*r bytes = 128*32768*8 = 32MiB, Node 기본 maxmem(32MiB)과
// 딱 맞아떨어져 오차로 넘쳐 ERR_CRYPTO_INVALID_SCRYPT_PARAMS가 나므로 여유있게 지정한다
// (vault.ts의 SCRYPT_MAXMEM과 동일한 이유로 명시적으로 넘겨야 함 — 직접 테스트로 확인).
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function hashSharePassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

export function verifySharePassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
