import crypto from 'crypto';

const getKey = () =>
  crypto.createHash('sha256')
    .update(process.env.AUTH_SECRET || 'tradeos-mail-default-key')
    .digest();

export function encryptPassword(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptPassword(enc: string): string {
  const key = getKey();
  const [ivHex, encHex] = enc.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encBuf = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString('utf8');
}
