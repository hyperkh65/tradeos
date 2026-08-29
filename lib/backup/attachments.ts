import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from '../db/sqlite';

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
}

export interface FileEntry { relPath: string; sizeBytes: number; sha256: string }

/** UPLOAD_DIR 전체를 재귀 스캔해서 실제 파일 목록 + 체크섬을 만든다. */
export function scanUploadedFiles(): FileEntry[] {
  const root = getUploadDir();
  if (!fs.existsSync(root)) return [];
  const out: FileEntry[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { walk(full); continue; }
      const buf = fs.readFileSync(full);
      out.push({
        relPath: path.relative(root, full),
        sizeBytes: stat.size,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      });
    }
  };
  walk(root);
  return out;
}

/** 스키마가 바뀔 때마다 사람이 일일이 컬럼 목록을 관리하지 않도록, 컬럼 이름이
 * 파일/첨부와 관련돼 보이는 TEXT 컬럼을 자동으로 찾아 그 값 전체를 대상으로 삼는다
 * (완벽한 정적 분석은 아니지만, 실제 스키마 확인 결과 이 휴리스틱으로 알려진 첨부
 * 컬럼(products.images_json, companies.biz_reg_file, purchase_orders.pi_file_url 등)이
 * 전부 잡힌다 — 새 기능이 비슷한 이름 규칙을 따르면 자동으로 커버됨). */
function findFileRefColumns(): { table: string; column: string }[] {
  const db = getDb();
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map(r => r.name);
  const out: { table: string; column: string }[] = [];
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; type: string }[];
    for (const c of cols) {
      if (/TEXT/i.test(c.type) && /file|upload|image|attach|logo|watermark|report|packing|stored_path/i.test(c.name)) {
        out.push({ table: t, column: c.name });
      }
    }
  }
  return out;
}

/** JSON이든 단순 문자열이든 상관없이 안에 들어있는 모든 문자열 leaf를 뽑아낸다
 * (images_json처럼 배열/객체로 저장된 경우와 pi_file_url처럼 단일 문자열인 경우를
 * 하나의 로직으로 같이 처리하기 위함). */
function extractStringLeaves(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const leaves: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') leaves.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(parsed);
      return leaves;
    } catch { /* JSON처럼 생겼지만 아니면 원문 그대로 취급 */ }
  }
  return [trimmed];
}

export interface AttachmentAuditResult {
  totalFiles: number;
  totalDbFileReferences: number;
  orphanFiles: string[]; // 디스크엔 있지만 DB 어디서도 참조되지 않음
  missingReferences: { table: string; column: string; value: string }[]; // DB엔 있지만 파일 없음
}

/** 첨부파일 디스크 상태와 DB 참조를 대조한다 — 요구사항: 누락을 조용히 무시하지 않는다. */
export function auditAttachments(): AttachmentAuditResult {
  const files = scanUploadedFiles();
  const uploadDir = getUploadDir();
  const fileByRelPath = new Map(files.map(f => [f.relPath, f]));
  const fileBasenames = new Map<string, string>(); // basename -> relPath (파일명만으로도 참조되는 경우 대비)
  for (const f of files) fileBasenames.set(path.basename(f.relPath), f.relPath);

  const db = getDb();
  const refColumns = findFileRefColumns();
  const referencedRelPaths = new Set<string>();
  const missingReferences: AttachmentAuditResult['missingReferences'] = [];
  let totalDbFileReferences = 0;

  for (const { table, column } of refColumns) {
    let rows: { v: string | null }[];
    try {
      rows = db.prepare(`SELECT ${column} as v FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`).all() as { v: string | null }[];
    } catch { continue; }
    for (const row of rows) {
      if (!row.v) continue;
      for (const leaf of extractStringLeaves(row.v)) {
        // 파일 경로처럼 보이는 것만 대상 — 순수 URL(http로 시작, 외부 링크)이나 너무 짧은 값은 제외
        if (leaf.length < 3 || /^https?:\/\//i.test(leaf)) continue;
        const base = path.basename(leaf);
        if (!/\.[a-zA-Z0-9]{1,6}$/.test(base) && !fileBasenames.has(base)) continue; // 확장자도 없고 알려진 파일명도 아니면 첨부파일 참조가 아닐 가능성이 큼
        totalDbFileReferences++;
        // 1) UPLOAD_DIR 기준 상대경로로 바로 존재하는지, 2) 파일명만으로 매칭되는지 확인
        const relGuess = leaf.replace(/^\//, '').replace(/^uploads\//, '');
        const resolved = fileByRelPath.has(relGuess) ? relGuess : fileBasenames.get(base);
        if (resolved) {
          referencedRelPaths.add(resolved);
        } else if (fs.existsSync(path.join(uploadDir, relGuess))) {
          referencedRelPaths.add(relGuess);
        } else {
          missingReferences.push({ table, column, value: leaf });
        }
      }
    }
  }

  const orphanFiles = files.map(f => f.relPath).filter(rp => !referencedRelPaths.has(rp));

  return { totalFiles: files.length, totalDbFileReferences, orphanFiles, missingReferences };
}
