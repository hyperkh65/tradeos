import fs from 'fs';
import path from 'path';

const SCAN_DIRS = ['app', 'lib', 'components'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
/** lib/config/domain.ts는 getAppDomain()의 fallback 기본값으로 도메인 문자열을 갖고
 * 있는 게 정상이다(요청서가 요구하는 "단일 진입점") — 여기만 스캔에서 제외한다. */
const EXCLUDE_FILE = path.join('lib', 'config', 'domain.ts');

export interface DomainScanHit { file: string; line: number; text: string }

/** 소스 트리에서 특정 도메인 문자열이 하드코딩된 곳을 찾는다 — 복구 시(change-domain.sh)
 * "구 도메인 잔존 0건"을 확인하는 용도이자, 평소에도 관리자가 "Domain Dependency Scan"
 * 버튼으로 회귀(누군가 실수로 도메인을 다시 하드코딩)를 잡아낼 수 있다. */
export function scanForHardcodedDomain(domain: string, root: string = process.cwd()): DomainScanHit[] {
  if (!domain) return [];
  const hits: DomainScanHit[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (['node_modules', '.next', '.git', 'data', 'dist'].includes(name)) continue;
      const full = path.join(dir, name);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXTENSIONS.has(path.extname(name))) continue;
      const rel = path.relative(root, full);
      if (rel === EXCLUDE_FILE) continue;
      let content: string;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      content.split('\n').forEach((line, idx) => {
        if (line.includes(domain)) hits.push({ file: rel, line: idx + 1, text: line.trim().slice(0, 200) });
      });
    }
  };
  for (const d of SCAN_DIRS) {
    const full = path.join(root, d);
    if (fs.existsSync(full)) walk(full);
  }
  return hits;
}
