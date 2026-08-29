#!/usr/bin/env node
// CI/로컬 전용 안전망 — 프로덕션 NAS엔 컴파일된 standalone 산출물만 배포되고 원본
// app/lib/components 소스가 없어서, 도메인 하드코딩 스캔은 소스가 실제로 존재하는
// 여기(빌드 시점)에서만 의미가 있다. tsx 등 dev 런타임 없이 plain node로 바로 실행 가능.
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const domain = (process.env.NEXT_PUBLIC_APP_URL || 'https://gw.ynk2014.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const SCAN_DIRS = ['app', 'lib', 'components'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const EXCLUDE = path.join('lib', 'config', 'domain.ts');

let hits = [];
function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (['node_modules', '.next', '.git', 'data', 'dist'].includes(name)) continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) { walk(full); continue; }
    if (!SCAN_EXT.has(path.extname(name))) continue;
    const rel = path.relative(root, full);
    if (rel === EXCLUDE) continue;
    const content = fs.readFileSync(full, 'utf8');
    content.split('\n').forEach((line, idx) => {
      if (line.includes(domain)) hits.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
}
for (const d of SCAN_DIRS) walk(path.join(root, d));

if (hits.length === 0) {
  console.log(`[domain-scan] OK — "${domain}" 하드코딩 없음 (lib/config/domain.ts 제외)`);
} else {
  console.warn(`[domain-scan] 경고 — "${domain}"이 소스에 ${hits.length}곳 하드코딩되어 있습니다(도메인 이전 시 수동 확인 필요):`);
  hits.forEach(h => console.warn('  ' + h));
}
