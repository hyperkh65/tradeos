import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type JSZip from 'jszip';
import { findNthElement, extractCellFormatting } from './docx-xml';

const execFileAsync = promisify(execFile);

// 원본 표7~10 셀의 실제 폭/행높이(twips)를 EMU로 환산한, 이미지가 들어갈 수 있는 최대 영역.
// (1 twip = 635 EMU) 셀 여백을 감안해 약 4% 여유를 둔다.
const CELL_WIDTH_TWIPS = 9230;
const CELL_HEIGHT_TWIPS = 5320;
const TWIP_TO_EMU = 635;
const MAX_BOX_EMU = { cx: Math.round(CELL_WIDTH_TWIPS * TWIP_TO_EMU * 0.96), cy: Math.round(CELL_HEIGHT_TWIPS * TWIP_TO_EMU * 0.96) };

// NAS 호스트에는 poppler-utils를 설치하지 않고 tradeos-docverify 컨테이너 안에만 둔다.
// DOCVERIFY_CONTAINER가 설정되어 있으면 `docker exec`로 컨테이너 안의 pdftoppm을 호출하고,
// 아니면(로컬 개발 등) 호스트에 직접 설치된 pdftoppm을 시도한다.
const DOCVERIFY_CONTAINER = process.env.DOCVERIFY_CONTAINER;
const DOCKER_BIN = process.env.DOCVERIFY_DOCKER_BIN || 'docker';

/** pdftoppm을 컨테이너(docker exec) 또는 호스트에 직접 실행한다.
 * 컨테이너 모드에서는 -v로 동일 경로에 마운트된 것을 전제로 호스트 절대경로를 그대로 넘긴다. */
async function execPdftoppm(args: string[]): Promise<void> {
  if (DOCVERIFY_CONTAINER) {
    await execFileAsync(DOCKER_BIN, ['exec', DOCVERIFY_CONTAINER, 'pdftoppm', ...args]);
  } else {
    await execFileAsync('pdftoppm', args);
  }
}

/** PDF의 특정 페이지를 고해상도 PNG로 변환한다. pdftoppm을 사용할 수 없으면 null을
 * 반환한다 — 이미지 삽입은 건너뛰지만 문서 생성 자체는 계속 진행되도록(우아한 실패) 설계했다.
 * 인프라 요구사항: tradeos-docverify 컨테이너(또는 서버에 직접 poppler-utils) 필요. */
async function rasterizePdfPage(pdfPath: string, pageNumber: number): Promise<Buffer | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-pdf-'));
  const outPrefix = path.join(tmpDir, 'page');
  try {
    await execPdftoppm(['-png', '-r', '220', '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, outPrefix]);
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('page') && f.endsWith('.png'));
    if (files.length === 0) return null;
    return fs.readFileSync(path.join(tmpDir, files[0]));
  } catch (e) {
    console.error('[docx-image] pdftoppm 사용 불가 또는 변환 실패:', (e as Error).message);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null; // PNG signature check (partial)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function fitContain(box: { cx: number; cy: number }, aspectRatio: number): { cx: number; cy: number } {
  let cx = box.cx;
  let cy = Math.round(cx / aspectRatio);
  if (cy > box.cy) {
    cy = box.cy;
    cx = Math.round(cy * aspectRatio);
  }
  return { cx, cy };
}

async function addImageToZip(zip: JSZip, pngBuffer: Buffer, tableIndex: number): Promise<string> {
  const filename = `supplierform_${tableIndex}_${Date.now()}.png`;
  zip.file(`word/media/${filename}`, pngBuffer);

  const relsPath = 'word/_rels/document.xml.rels';
  const relsXml = await zip.file(relsPath)!.async('string');
  const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
  const nextId = Math.max(0, ...existingIds) + 1;
  const rId = `rId${nextId}`;
  const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`;
  const newRelsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);
  zip.file(relsPath, newRelsXml);

  return rId;
}

function buildDrawingXml(rId: string, cx: number, cy: number, docPrId: number): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="SupplierAttachment${docPrId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="SupplierAttachment${docPrId}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

/**
 * PDF의 지정 페이지를 표(tableIndex)의 유일한 셀에 원본 비율을 유지한 채 삽입한다.
 * - 셀 폭/행높이(twips→EMU 환산) 안에 완전히 들어가도록 contain 방식으로 축소/확대
 * - 찌그러짐 없음(종횡비 고정), 셀 밖으로 넘치지 않음
 * - pdftoppm이 없거나 변환에 실패하면 null을 반환 — 호출부가 원본 참고이미지가 이미
 *   지워진 상태(clearImageCell)를 그대로 유지하도록 그레이스풀하게 처리한다.
 */
export async function insertImageIntoCell(zip: JSZip, xml: string, tableIndex: number, pdfAbsolutePath: string, pageNumber: number): Promise<string | null> {
  if (!fs.existsSync(pdfAbsolutePath)) return null;
  const png = await rasterizePdfPage(pdfAbsolutePath, pageNumber);
  if (!png) return null;
  const dims = readPngDimensions(png);
  if (!dims) return null;

  const fitted = fitContain(MAX_BOX_EMU, dims.width / dims.height);
  const rId = await addImageToZip(zip, png, tableIndex);
  const drawingXml = buildDrawingXml(rId, fitted.cx, fitted.cy, 9000 + tableIndex);

  const tbl = findNthElement(xml, 'w:tbl', tableIndex - 1);
  if (!tbl) return null;
  const tr = findNthElement(xml, 'w:tr', 0, tbl.start, tbl.end);
  if (!tr) return null;
  const tc = findNthElement(xml, 'w:tc', 0, tr.start, tr.end);
  if (!tc) return null;

  const cellXml = xml.slice(tc.start, tc.end);
  const fmt = extractCellFormatting(cellXml);
  const newCell = `<w:tc>${fmt.tcPr}<w:p>${fmt.pPr}<w:r>${fmt.rPr}${drawingXml}</w:r></w:p></w:tc>`;
  return xml.slice(0, tc.start) + newCell + xml.slice(tc.end);
}
