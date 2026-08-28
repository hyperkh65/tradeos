import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

// lib/supplier-form/docx-image.ts와 동일한 인프라: NAS 호스트에는 LibreOffice를 직접
// 설치하지 않고 tradeos-docverify 컨테이너 안에서만 실행한다. 컨테이너는 호스트와 동일
// 절대경로로 /tmp가 마운트되어 있어(-v /tmp:/tmp) 경로 변환 없이 그대로 쓸 수 있다.
const DOCVERIFY_CONTAINER = process.env.DOCVERIFY_CONTAINER;
const DOCKER_BIN = process.env.DOCVERIFY_DOCKER_BIN || 'docker';

async function execLibreoffice(args: string[]): Promise<void> {
  if (DOCVERIFY_CONTAINER) {
    await execFileAsync(DOCKER_BIN, ['exec', DOCVERIFY_CONTAINER, 'libreoffice', ...args], { timeout: 120_000 });
  } else {
    await execFileAsync('libreoffice', args, { timeout: 120_000 });
  }
}

/**
 * DOCX를 PDF로 변환한다(LibreOffice headless). docverify 컨테이너를 쓸 수 없으면 null을
 * 반환한다 — 호출부(generate-pipeline.ts)는 "PDF 변환 서버를 사용할 수 없습니다" 같은
 * 명확한 에러로 바꿔서 DOCX만이라도 내려받을 수 있는 degraded 모드로 처리해야 한다.
 *
 * 주의: docxAbsolutePath는 컨테이너와 호스트가 동일하게 마운트된 경로(/tmp 하위)여야
 * 한다 — generate-pipeline.ts가 항상 os.tmpdir() 하위에 파일을 쓰는 이유.
 */
export async function convertDocxToPdf(docxAbsolutePath: string): Promise<Buffer | null> {
  const outDir = path.dirname(docxAbsolutePath);
  const pdfPath = docxAbsolutePath.replace(/\.docx$/i, '.pdf');
  try {
    await execLibreoffice(['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxAbsolutePath]);
    if (!fs.existsSync(pdfPath)) return null;
    return fs.readFileSync(pdfPath);
  } catch (e) {
    console.error('[approval-doc] LibreOffice 변환 실패:', (e as Error).message);
    return null;
  }
}

/** 임시 작업 디렉토리를 만들고, 콜백 실행 후 정리한다. os.tmpdir()은 docverify 컨테이너와
 * 공유 마운트된 /tmp 하위를 보장하므로 항상 이 헬퍼를 통해 경로를 얻어야 한다. */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
