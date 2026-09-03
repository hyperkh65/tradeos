import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Header, Footer, PageNumber, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, VerticalAlign,
} from 'docx';

/**
 * 참고 엑셀의 근본 문제(측정항목마다 컬럼을 만들어 A4 인쇄 폭을 넘겨 좌/우 페이지로
 * 갈라짐, Context 참고)를 피하기 위해 이 파일은 절대 측정항목 수만큼 표 컬럼을 늘리지
 * 않는다 — 측정값 표는 §6/§7 요구대로 "항목을 행으로" 나열하는 5컬럼 고정 표만 쓴다.
 * 값과 단위는 DB에 분리 저장하지만(값/단위 컬럼이 각각 따로) 문서에는 항상 "값+단위"로
 * 합쳐서 렌더링해 헤더에 단위가 없고 값에도 단위가 없는 참고 엑셀의 혼동을 반복하지 않는다.
 */

export interface InspectionDocMeta {
  businessId: string;
  reportType: 'pre_approval' | 'pre_shipment';
  title: string;
  projectName: string;
  customerName?: string;
  supplierName?: string;
  manufacturerName?: string;
  poNumber?: string;
  piNumber?: string;
  productionLotNo?: string;
  dueDate?: string;
  issueDate: string;
}

export interface DocMeasurementRow {
  itemLabel: string;
  baselineValue?: string; baselineUnit?: string;
  measuredValue?: string; measuredUnit?: string;
  minValue?: string; maxValue?: string;
  judgement?: string;
}
export interface DocWireSpecRow {
  wireRole: 'input' | 'output';
  wireSpec?: string; conductorArea?: string;
  baselineLengthValue?: string; baselineLengthUnit?: string;
  measuredLengthValue?: string; measuredLengthUnit?: string;
  connectorModel?: string;
}
export interface DocPhoto { categoryKey: string; label: string; buffer: Buffer; width: number; height: number }
export interface DocDiffRow {
  compareItem: string; judgement?: string; changeLocation?: string;
  beforeDesc?: string; afterDesc?: string; reason?: string; needsApproval: boolean;
}
export interface DocProduct {
  productName?: string; modelName?: string; manufacturer?: string; productionLot?: string;
  certNumber?: string; dimensions?: string; weightG?: string;
  overallJudgement?: string;
  measurements: DocMeasurementRow[];
  wireSpecs: DocWireSpecRow[];
  photos: DocPhoto[];
  diffs: DocDiffRow[];
}

export interface BuildInspectionDocxOptions {
  meta: InspectionDocMeta;
  products: DocProduct[];
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
const TABLE_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER, insideHorizontal: CELL_BORDER, insideVertical: CELL_BORDER };

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
    shading: { fill: 'F2F2F2' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
  });
}
function bodyCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 18 })] })],
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
  });
}

function fmtValueUnit(value?: string, unit?: string): string {
  const v = (value ?? '').trim();
  if (!v) return '-';
  const u = (unit ?? '').trim();
  return u ? `${v}${u}` : v;
}

/** §6/§7 핵심 표 — 측정항목이 몇 개든 항상 5컬럼 고정이라 폭이 늘어나지 않는다.
 * tableHeader:true로 표가 페이지를 넘어가도 헤더 행이 반복되고, 각 바디 행은
 * cantSplit:true로 한 행이 페이지 경계에서 잘리지 않는다. */
function buildMeasurementTable(rows: DocMeasurementRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['항목', '기준값', '측정값', '허용범위', '판정'].map(headerCell),
      }),
      ...rows.map(r => new TableRow({
        cantSplit: true,
        children: [
          bodyCell(r.itemLabel),
          bodyCell(fmtValueUnit(r.baselineValue, r.baselineUnit)),
          bodyCell(fmtValueUnit(r.measuredValue, r.measuredUnit)),
          bodyCell(r.minValue || r.maxValue ? `${r.minValue ?? ''}~${r.maxValue ?? ''}` : '-'),
          bodyCell(r.judgement || '-'),
        ],
      })),
    ],
  });
}

const WIRE_ROLE_LABEL: Record<string, string> = { input: '입력선', output: '출력선' };

function buildWireSpecTable(rows: DocWireSpecRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['구분', '규격', '단면적', '기준길이', '측정길이', '커넥터'].map(headerCell),
      }),
      ...rows.map(w => new TableRow({
        cantSplit: true,
        children: [
          bodyCell(WIRE_ROLE_LABEL[w.wireRole] || w.wireRole),
          bodyCell(w.wireSpec || '-'),
          bodyCell(w.conductorArea || '-'),
          bodyCell(fmtValueUnit(w.baselineLengthValue, w.baselineLengthUnit)),
          bodyCell(fmtValueUnit(w.measuredLengthValue, w.measuredLengthUnit)),
          bodyCell(w.connectorModel || '-'),
        ],
      })),
    ],
  });
}

function buildDiffTable(rows: DocDiffRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['비교항목', '판정', '변경위치', '사유', '승인필요'].map(headerCell),
      }),
      ...rows.map(d => new TableRow({
        cantSplit: true,
        children: [
          bodyCell(d.compareItem),
          bodyCell(d.judgement || '-'),
          bodyCell(d.changeLocation || '-'),
          bodyCell(d.reason || '-'),
          bodyCell(d.needsApproval ? 'Y' : '-'),
        ],
      })),
    ],
  });
}

// A4 세로 기준 사진 1장의 최대 박스(px, 96dpi) — 그리드 2열 배치를 가정해 폭을 절반보다
// 약간 좁게 잡는다. 비율 유지(contain)로만 맞추고 절대 찌그러뜨리지 않는다.
const PHOTO_BOX = { width: 280, height: 210 };
function fitContain(box: { width: number; height: number }, w: number, h: number): { width: number; height: number } {
  const ratio = Math.min(box.width / w, box.height / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function buildPhotoCell(photo: DocPhoto): TableCell {
  const fitted = fitContain(PHOTO_BOX, photo.width, photo.height);
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: 'png', data: photo.buffer, transformation: fitted })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: photo.label, size: 15, color: '666666' })] }),
    ],
  });
}

/** 사진을 2열 그리드로 배치 — 표(Table)를 그리드로 쓰는 이유는 docx가 flex/grid 레이아웃을
 * 지원하지 않고, 표는 셀이 페이지 경계에서 잘리지 않아 사진+캡션이 항상 붙어 다니기 때문. */
function buildPhotoGrid(photos: DocPhoto[]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < photos.length; i += 2) {
    const cells = [buildPhotoCell(photos[i])];
    if (photos[i + 1]) cells.push(buildPhotoCell(photos[i + 1]));
    else cells.push(new TableCell({ children: [new Paragraph({})] }));
    rows.push(new TableRow({ cantSplit: true, children: cells }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } });
}

function buildProductCard(product: DocProduct, index: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  if (index > 0) out.push(new Paragraph({ children: [new PageBreak()] }));

  out.push(new Paragraph({
    text: `제품 ${index + 1}. ${product.productName || '(제품명 없음)'}${product.modelName ? ` — ${product.modelName}` : ''}`,
    heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 160 },
  }));
  const infoLines = [
    `제조업체: ${product.manufacturer || '-'}`,
    `생산 LOT: ${product.productionLot || '-'}`,
    `인증번호: ${product.certNumber || '-'}`,
    `치수/중량: ${product.dimensions || '-'} / ${product.weightG ? `${product.weightG}g` : '-'}`,
  ];
  for (const line of infoLines) out.push(new Paragraph({ text: line, spacing: { after: 40 }, run: { size: 18 } }));

  out.push(sectionHeading('측정항목'));
  out.push(buildMeasurementTable(product.measurements));

  if (product.wireSpecs.length > 0) {
    out.push(sectionHeading('입력선/출력선'));
    out.push(buildWireSpecTable(product.wireSpecs));
  }

  if (product.photos.length > 0) {
    out.push(sectionHeading('사진'));
    out.push(buildPhotoGrid(product.photos));
  }

  if (product.diffs.length > 0) {
    out.push(sectionHeading('사전승인 대비 비교'));
    out.push(buildDiffTable(product.diffs));
  }

  return out;
}

/** §14 요구 — 제품이 2개 이상이면 표지 뒤에 전체 요약표를 넣어 한눈에 파악 가능하게 한다. */
function buildSummaryTable(products: DocProduct[]): (Paragraph | Table)[] {
  if (products.length < 2) return [];
  return [
    sectionHeading('제품 요약'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({ tableHeader: true, children: ['No', '제품명', '모델명', '전체 판정'].map(headerCell) }),
        ...products.map((p, i) => new TableRow({
          cantSplit: true,
          children: [bodyCell(String(i + 1)), bodyCell(p.productName || '-'), bodyCell(p.modelName || '-'), bodyCell(p.overallJudgement || '-')],
        })),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

/** §15 결재란 — 승인서 종류에 따라 판정값 목록이 다르다(호출부가 FINAL_DECISION_OPTIONS로
 * 넘겨준 문자열을 그대로 나열만 하고, 이 파일은 어떤 값이 유효한지 모른다). */
function buildApprovalBlock(decisionOptions: string[]): (Paragraph | Table)[] {
  return [
    sectionHeading('결재'),
    new Paragraph({ text: `최종 판정: ${decisionOptions.join(' / ')} (해당 항목에 표시)`, spacing: { after: 200 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({ children: ['작성', '검토', '승인'].map(headerCell) }),
        new TableRow({ children: Array.from({ length: 3 }, () => new TableCell({ children: [new Paragraph({ text: ' ' }), new Paragraph({ text: ' ' })], margins: { top: 200, bottom: 200, left: 70, right: 70 } })) }),
      ],
    }),
  ];
}

function buildCover(meta: InspectionDocMeta): Paragraph[] {
  return [
    new Paragraph({ text: meta.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    new Paragraph({ text: meta.projectName, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    new Paragraph({ text: `문서번호: ${meta.businessId}` }),
    new Paragraph({ text: `발행일: ${meta.issueDate}` }),
    ...(meta.dueDate ? [new Paragraph({ text: `제출기한: ${meta.dueDate}` })] : []),
    ...(meta.customerName ? [new Paragraph({ text: `고객사: ${meta.customerName}` })] : []),
    ...(meta.supplierName ? [new Paragraph({ text: `공급업체: ${meta.supplierName}` })] : []),
    ...(meta.manufacturerName ? [new Paragraph({ text: `제조업체: ${meta.manufacturerName}` })] : []),
    ...(meta.poNumber ? [new Paragraph({ text: `PO 번호: ${meta.poNumber}` })] : []),
    ...(meta.piNumber ? [new Paragraph({ text: `PI 번호: ${meta.piNumber}` })] : []),
    ...(meta.productionLotNo ? [new Paragraph({ text: `생산 LOT 번호: ${meta.productionLotNo}` })] : []),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

export async function buildInspectionDocx(opts: BuildInspectionDocxOptions, decisionOptions: string[]): Promise<Buffer> {
  const { meta, products } = opts;
  const children: (Paragraph | Table)[] = [
    ...buildCover(meta),
    ...buildSummaryTable(products),
    ...products.flatMap((p, i) => buildProductCard(p, i)),
    ...buildApprovalBlock(decisionOptions),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`${meta.title} | ${meta.businessId}`)] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(' / '), new TextRun({ children: [PageNumber.TOTAL_PAGES] })],
            })],
          }),
        },
        children,
      },
    ],
    styles: {
      default: {
        document: { run: { font: 'Noto Sans CJK KR', size: 20 } },
        heading1: { run: { font: 'Noto Sans CJK KR', bold: true, size: 26 } },
        heading2: { run: { font: 'Noto Sans CJK KR', bold: true, size: 22 } },
        title: { run: { font: 'Noto Sans CJK KR', bold: true, size: 40 } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
