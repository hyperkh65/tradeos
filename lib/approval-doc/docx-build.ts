import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Header, Footer, PageNumber, AlignmentType, PageBreak,
  TabStopType, LeaderType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
  HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom,
  TextWrappingType,
} from 'docx';
import type { DocProjectMeta, NumberedSection, SectionContent, TocPageMap } from './types';
import { headingText } from './numbering';

/** docx-build.ts는 파일시스템을 몰라도 되게 유지한다 — 로고 파일을 실제로 읽어 버퍼로
 * 넘기는 책임은 호출부(generate/route.ts)가 진다. */
export interface BrandOptions {
  companyName?: string;
  logoBuffer?: Buffer;
  logoDimensions?: { width: number; height: number };
  accentColorHex?: string; // 'RRGGBB', 헤딩/표 헤더 색상에 적용
  footerText?: string;
  /** 이미 불투명도가 픽셀 단위로 반영된 PNG 버퍼 — docx-build.ts는 파일시스템/sharp를
   * 모르게 유지하기 위해 호출부(generate/route.ts)가 opacity를 미리 구워서 넘긴다. */
  watermarkBuffer?: Buffer;
  watermarkDimensions?: { width: number; height: number };
}
export interface TemplateOptions {
  baseFont: string;
  headingFont: string;
}

export interface BuildDocxOptions {
  meta: DocProjectMeta;
  docTitle: string;
  sections: NumberedSection[];
  contents: SectionContent[];
  /** 2차 생성에서만 전달 — 1차에서는 undefined(자리표시자로 채움). */
  tocPageNumbers?: TocPageMap;
  brand?: BrandOptions;
  template?: TemplateOptions;
}

const TOC_PLACEHOLDER = '…';
// 목차 오른쪽 정렬 탭 위치(twips) — 자리표시자와 실제 숫자가 항상 같은 폭의 탭 안에 들어가
// 줄바꿈에 영향을 주지 않도록 1차/2차 생성 모두 이 상수를 그대로 재사용한다.
const TOC_TAB_POSITION = 9000;

// 목차 안에도 각 장 제목과 동일한 문자열("장번호. 제목")이 그대로 들어가므로, pagination.ts가
// 단순 텍스트 검색만 하면 본문이 아니라 목차 자신의 페이지를 "그 장이 시작하는 페이지"로
// 잘못 찾는다. 목차 바로 뒤·본문 시작 직전에 이 마커 문단을 심어두고, pagination.ts는 반드시
// 이 마커가 있는 페이지 이후에서만 장 제목을 검색하게 해서 그 문제를 근본적으로 차단한다.
export const BODY_START_MARKER = 'APPROVAL-DOC-BODY-START-MARKER';

function buildCover(meta: DocProjectMeta, docTitle: string, brand?: BrandOptions): Paragraph[] {
  const logoParagraphs: Paragraph[] = [];
  if (brand?.logoBuffer && brand.logoDimensions) {
    // 원본 비율을 유지한 채 가로 최대 160pt로 맞춘다 — 로고가 찌그러지거나 과도하게
    // 커지지 않도록(요청서 §8 이미지 삽입 원칙과 동일한 기준을 표지 로고에도 적용).
    const maxWidthPt = 160;
    const ratio = brand.logoDimensions.height / brand.logoDimensions.width;
    const width = Math.min(maxWidthPt, brand.logoDimensions.width);
    const height = Math.round(width * ratio);
    logoParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new ImageRun({ type: 'png', data: brand.logoBuffer, transformation: { width, height } })],
    }));
  }
  return [
    ...logoParagraphs,
    ...(brand?.companyName ? [new Paragraph({ text: brand.companyName, alignment: AlignmentType.CENTER, spacing: { after: 200 } })] : []),
    new Paragraph({ text: docTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 600 } }),
    new Paragraph({ text: meta.productName, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
    new Paragraph({ text: `Model: ${meta.modelName}`, alignment: AlignmentType.CENTER, spacing: { after: 600 } }),
    new Paragraph({ text: `문서번호: ${meta.businessId}` }),
    new Paragraph({ text: `개정번호: ${meta.revision}` }),
    new Paragraph({ text: `발행일: ${meta.issueDate}` }),
    ...(meta.customerName ? [new Paragraph({ text: `고객사: ${meta.customerName}` })] : []),
    ...(meta.supplierName ? [new Paragraph({ text: `공급업체: ${meta.supplierName}` })] : []),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildToc(sections: NumberedSection[], tocPageNumbers: TocPageMap | undefined): Paragraph[] {
  const rows = sections.map(s =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TOC_TAB_POSITION, leader: LeaderType.DOT }],
      children: [
        new TextRun(headingText(s)),
        new TextRun({ text: '\t' + String(tocPageNumbers?.[s.id] ?? TOC_PLACEHOLDER) }),
      ],
      spacing: { after: 120 },
    })
  );
  return [
    new Paragraph({ text: '목차', heading: HeadingLevel.HEADING_1, spacing: { after: 400 } }),
    ...rows,
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
const TABLE_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER, insideHorizontal: CELL_BORDER, insideVertical: CELL_BORDER };

function headerCell(text: string, accentFill?: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
    shading: { fill: accentFill || 'F2F2F2' },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}
function bodyCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ text })],
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

/** 표가 페이지를 넘어가면 다음 페이지에도 머리행이 자동 반복되도록 tableHeader:true를
 * 쓴다 — 참고 문서가 이 기능 없이 헤더 행을 손으로 복제해뒀던 것을 정식 기능으로 대체. */
function buildTable(table: { headers: string[]; rows: string[][] }, accentFill?: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: table.headers.map(h => headerCell(h, accentFill)) }),
      ...table.rows.map(row => new TableRow({ children: row.map(bodyCell) })),
    ],
  });
}

// A4 세로 기준 본문 최대 폭/높이(px 단위, docx 라이브러리는 96dpi 기준 px로 취급) — 여백을
// 감안한 안전 값. 이미지가 셀/페이지 밖으로 넘치거나 찌그러지지 않도록 항상 비율 유지(contain)로
// 이 박스 안에 맞춘다(요청서 §8 이미지 삽입 원칙).
const MAX_IMAGE_BOX = { width: 620, height: 780 };

function fitContain(box: { width: number; height: number }, w: number, h: number): { width: number; height: number } {
  const ratio = Math.min(box.width / w, box.height / h, 1); // 원본보다 무리하게 확대하지 않음
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

/** 이미지 1장 + (있으면) 캡션을 같은 페이지에 배치되도록 연속 문단으로 만든다 — 요청서 §8
 * "관련 이미지와 캡션을 같은 페이지에 배치"를 페이지 나눔이 그 사이에 끼지 않게 구현. */
function buildImageParagraphs(img: { buffer: Buffer; width: number; height: number; caption?: string | null }): Paragraph[] {
  const fitted = fitContain(MAX_IMAGE_BOX, img.width, img.height);
  const paras = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: img.caption ? 60 : 200 },
      children: [new ImageRun({ type: 'png', data: img.buffer, transformation: fitted })],
    }),
  ];
  if (img.caption) {
    paras.push(new Paragraph({ text: img.caption, alignment: AlignmentType.CENTER, spacing: { after: 200 }, run: { size: 18, color: '666666' } }));
  }
  return paras;
}

function buildBody(sections: NumberedSection[], contents: SectionContent[], accentFill?: string): (Paragraph | Table)[] {
  const contentBySection = new Map(contents.map(c => [c.sectionInstanceId, c]));
  const out: (Paragraph | Table)[] = [
    // 흰색 텍스트로 렌더링해 육안·인쇄에는 안 보이지만 텍스트 추출에는 정상적으로 잡힌다.
    // (font size를 극단적으로 줄이는 방식은 시도했으나 LibreOffice PDF 텍스트 레이어에서
    // 통째로 누락되는 것을 실측으로 확인해 폐기 — 흰색 텍스트 방식이 안정적으로 동작함.)
    // 순수히 pagination.ts의 검색 시작 지점을 표시하는 용도이며 사용자에게 보여줄 내용이
    // 아니므로 줄 간격도 최소화한다.
    new Paragraph({
      children: [new TextRun({ text: BODY_START_MARKER, color: 'FFFFFF', size: 12 })],
      spacing: { after: 0, line: 120 },
    }),
  ];
  sections.forEach((s, idx) => {
    out.push(new Paragraph({ text: headingText(s), heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 200 } }));
    const content = contentBySection.get(s.id);
    const hasAnyContent = !!content && (content.paragraphs.length > 0 || !!content.table?.rows.length || !!content.attachments?.length || !!content.images?.length);
    if (!hasAnyContent) {
      out.push(new Paragraph({ text: '(내용 없음)', style: 'IntenseQuote' }));
    } else {
      if (content!.paragraphs.length > 0) {
        for (const p of content!.paragraphs) out.push(new Paragraph({ text: p, spacing: { after: 80 } }));
      }
      if (content!.table && content!.table.rows.length > 0) {
        out.push(buildTable(content!.table, accentFill));
      }
      if (content!.images && content!.images.length > 0) {
        for (const img of content!.images) out.push(...buildImageParagraphs(img));
      }
      if (content!.attachments && content!.attachments.length > 0) {
        out.push(new Paragraph({ text: '첨부파일', spacing: { before: 200, after: 100 }, run: { bold: true } }));
        for (const a of content!.attachments) {
          out.push(new Paragraph({ text: `- ${a.filename}${a.description ? ` (${a.description})` : ''}` }));
        }
      }
    }
    if (idx < sections.length - 1) out.push(new Paragraph({ children: [new PageBreak()] }));
  });
  return out;
}

/**
 * 표지 + 목차(정적 문단 목록, Word TOC 필드 아님 — pagination.ts 주석 참고) + 본문을
 * docx 라이브러리로 매번 처음부터 조립한다. tocPageNumbers가 없으면(1차 생성) 페이지번호
 * 칸을 자리표시자로 채우고, 있으면(2차 생성) 실제 숫자를 넣는다 — 두 경우 모두 문단
 * 구조/줄 수가 완전히 동일해서(§3-3 참고) 2-pass만으로 충분하다.
 */
/** 강조색을 표 헤더 배경으로 쓰기엔 너무 진해 굵은 텍스트와 대비가 나빠지는 경우가 많아,
 * 흰색과 80% 섞어 옅은 톤으로 낮춘다 — 브랜드 색상은 유지하되 가독성은 지킨다. */
function lightenHex(hex?: string): string | undefined {
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const mix = (v: number) => Math.round(v + (255 - v) * 0.8).toString(16).padStart(2, '0');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return `${mix(r)}${mix(g)}${mix(b)}`.toUpperCase();
}

// 워터마크 최대 크기(px, 96dpi 기준) — 페이지 대부분을 덮되 여백 밖으로 넘치지 않게.
const WATERMARK_MAX_BOX = { width: 500, height: 650 };

/** 모든 페이지의 머리글에 한 번만 넣으면 머리글이 각 페이지에 반복되는 성질을 이용해
 * "매 페이지 워터마크"를 구현한다 — behindDocument:true로 본문 텍스트 뒤에 깔리고,
 * wrap:NONE이라 주변 레이아웃에 영향을 주지 않는다. */
function buildWatermarkParagraph(watermark: { buffer: Buffer; width: number; height: number }): Paragraph {
  const fitted = fitContain(WATERMARK_MAX_BOX, watermark.width, watermark.height);
  return new Paragraph({
    children: [
      new ImageRun({
        type: 'png',
        data: watermark.buffer,
        transformation: fitted,
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
          behindDocument: true,
          wrap: { type: TextWrappingType.NONE },
        },
      }),
    ],
  });
}

export async function buildApprovalDocx(opts: BuildDocxOptions): Promise<Buffer> {
  const { meta, docTitle, sections, contents, tocPageNumbers, brand, template } = opts;
  const baseFont = template?.baseFont || 'Noto Sans CJK KR';
  const headingFont = template?.headingFont || baseFont;
  const accentHex = brand?.accentColorHex && /^[0-9a-fA-F]{6}$/.test(brand.accentColorHex) ? brand.accentColorHex.toUpperCase() : undefined;
  const tableAccentFill = lightenHex(accentHex);
  const footerNote = brand?.footerText ? ` | ${brand.footerText}` : '';

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              ...(brand?.watermarkBuffer && brand.watermarkDimensions
                ? [buildWatermarkParagraph({ buffer: brand.watermarkBuffer, width: brand.watermarkDimensions.width, height: brand.watermarkDimensions.height })]
                : []),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun(`${docTitle} | ${meta.modelName} | Rev.${meta.revision} | ${meta.issueDate}`)],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun('Page '),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun(' / '),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                  ...(footerNote ? [new TextRun({ text: footerNote, size: 16, color: '888888' })] : []),
                ],
              }),
            ],
          }),
        },
        children: [
          ...buildCover(meta, docTitle, brand),
          ...buildToc(sections, tocPageNumbers),
          ...buildBody(sections, contents, tableAccentFill),
        ],
      },
    ],
    styles: {
      default: {
        document: { run: { font: baseFont, size: 21 } }, // 10.5pt
        heading1: { run: { font: headingFont, bold: true, size: 28, color: accentHex } },
        title: { run: { font: headingFont, bold: true, size: 44, color: accentHex } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
