import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import './pdfjs-polyfill';

const execFileAsync = promisify(execFile);

// lib/supplier-form/docx-image.ts와 동일한 인프라: NAS 호스트에는 poppler-utils를 직접
// 설치하지 않고 tradeos-docverify 컨테이너 안에서만 실행한다.
const DOCVERIFY_CONTAINER = process.env.DOCVERIFY_CONTAINER;
const DOCKER_BIN = process.env.DOCVERIFY_DOCKER_BIN || 'docker';

async function execPdftoppm(args: string[]): Promise<void> {
  if (DOCVERIFY_CONTAINER) {
    await execFileAsync(DOCKER_BIN, ['exec', DOCVERIFY_CONTAINER, 'pdftoppm', ...args]);
  } else {
    await execFileAsync('pdftoppm', args);
  }
}

/** PDF의 특정 페이지를 고해상도 PNG로 래스터화한다. 실패(변환서버 없음 등)하면 null —
 * 호출부가 "이 페이지는 문서에 못 넣었다"는 경고로 우아하게 처리하도록 예외를 던지지 않는다. */
export async function rasterizePdfPage(pdfPath: string, pageNumber: number, dpi = 220): Promise<Buffer | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apd-pdfpage-'));
  const outPrefix = path.join(tmpDir, 'page');
  try {
    await execPdftoppm(['-png', '-r', String(dpi), '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, outPrefix]);
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('page') && f.endsWith('.png'));
    if (files.length === 0) return null;
    return fs.readFileSync(path.join(tmpDir, files[0]));
  } catch (e) {
    console.error('[approval-doc pdf-page] pdftoppm 사용 불가 또는 변환 실패:', (e as Error).message);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** PDF 총 페이지 수 — pdfjs-dist는 순수 JS라 docverify 컨테이너 없이도 동작한다(썸네일
 * 목록을 보여주기 전에 "몇 페이지짜리인지" 정도는 항상 알 수 있어야 하므로 분리). */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  return doc.numPages;
}
