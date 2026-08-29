#!/usr/bin/env node
// 재해복구 전용 — Node 내장 crypto만 사용(npm install 없이 어떤 Node에서도 바로 실행).
// lib/backup/vault.ts의 encryptVault()와 정확히 대칭인 복호화 로직이다(파라미터가
// 하나라도 다르면 복호화가 실패하므로, 저 파일을 고치면 이 파일도 반드시 같이 고칠 것).
//
// 사용법: node decrypt-secrets.js <secrets.enc 경로> <출력 .env 경로>
//         Recovery Password는 환경변수 RECOVERY_PASSWORD로 넘기거나, 안 넘기면 프롬프트로 입력받는다.

const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

const KEY_LEN = 32;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

function deriveKey(password, saltHex, kdfParams) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(password, salt, KEY_LEN, {
    N: kdfParams.N, r: kdfParams.r, p: kdfParams.p, maxmem: SCRYPT_MAXMEM,
  });
}

function decryptVault(blob, password) {
  const key = deriveKey(password, blob.salt, blob.kdfParams);
  const iv = Buffer.from(blob.iv, 'hex');
  const authTag = Buffer.from(blob.authTag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const ciphertext = Buffer.from(blob.ciphertext, 'hex');
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function promptPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Recovery Password: ', (answer) => { rl.close(); resolve(answer); });
  });
}

function envLine(key, value) {
  if (value === null || value === undefined || value === '') return null;
  return `${key}=${JSON.stringify(String(value))}`;
}

async function main() {
  const [, , secretsPath, outEnvPath] = process.argv;
  if (!secretsPath || !outEnvPath) {
    console.error('사용법: node decrypt-secrets.js <secrets.enc 경로> <출력 .env 경로>');
    process.exit(1);
  }
  const blob = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  const password = process.env.RECOVERY_PASSWORD || await promptPassword();

  let secrets;
  try {
    secrets = decryptVault(blob, password);
  } catch (e) {
    console.error('복호화 실패 — Recovery Password가 올바르지 않거나 파일이 손상되었습니다.');
    process.exit(1);
  }

  const lines = [];
  lines.push(envLine('AUTH_SECRET', secrets.authSecret));
  lines.push(envLine('NOTION_TOKEN', secrets.notionToken));
  if (secrets.mail) {
    lines.push(envLine('MAIL_SMTP_HOST', secrets.mail.smtpHost));
    lines.push(envLine('MAIL_SMTP_PORT', secrets.mail.smtpPort));
    lines.push(envLine('MAIL_IMAP_HOST', secrets.mail.imapHost));
    lines.push(envLine('MAIL_IMAP_PORT', secrets.mail.imapPort));
    lines.push(envLine('MAIL_USERNAME', secrets.mail.username));
    lines.push(envLine('MAIL_PASSWORD', secrets.mail.password));
  }
  if (secrets.nas) {
    lines.push(envLine('NAS_WEBDAV_URL', secrets.nas.webdavUrl));
    lines.push(envLine('NAS_USERNAME', secrets.nas.username));
    lines.push(envLine('NAS_PASSWORD', secrets.nas.password));
    lines.push(envLine('NAS_BASE_PATH', secrets.nas.basePath));
    lines.push(envLine('NAS_PUBLIC_BASE_URL', secrets.nas.publicBaseUrl));
  }
  lines.push(envLine('QDRANT_API_KEY', secrets.qdrantApiKey));

  fs.writeFileSync(outEnvPath, lines.filter(Boolean).join('\n') + '\n', { mode: 0o600 });
  // AI Provider 토큰은 .env가 아니라 DB(ai_providers 테이블, database.dump 복원분)에
  // 이미 들어있어서 여기서 다시 쓸 필요가 없다 — collectSecrets()가 이걸 담는 이유는
  // "복호화된 사본을 이 파일 하나로도 확인/문서화"하려는 목적이라, 별도 참고용
  // JSON으로만 남긴다(민감정보이므로 .env처럼 앱이 자동으로 읽는 위치엔 두지 않음).
  const aiProvidersRefPath = outEnvPath + '.ai-providers-reference.json';
  fs.writeFileSync(aiProvidersRefPath, JSON.stringify(secrets.aiProviders || [], null, 2), { mode: 0o600 });

  console.log(`복호화 완료 — ${outEnvPath} 생성됨(AI Provider 토큰 참고용: ${aiProvidersRefPath})`);
}

main();
