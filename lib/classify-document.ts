import type { ShipDocType } from '@/types';

const KEYWORDS: Record<string, string[]> = {
  invoice: [
    'commercial invoice', 'proforma invoice', 'invoice no', 'invoice number',
    'unit price', 'total amount', 'subtotal', 'payment terms', 'payment condition',
    'bank name', 'swift', 'beneficiary', 'remittance', 'wire transfer',
    'seller', 'buyer', 'exporter', 'importer',
    '인보이스', '단가', '결제조건', '수출자', '수입자',
  ],
  packing_list: [
    'packing list', 'packing no', 'gross weight', 'net weight',
    'g.w.', 'n.w.', 'cbm', 'measurement', 'carton', 'cartons',
    'packages', 'package no', 'pkgs', 'pcs per carton', 'total pcs',
    '패킹리스트', '총중량', '순중량', '포장수', '체적',
  ],
  bl: [
    'bill of lading', 'b/l no', 'b/l number', 'shipper', 'consignee',
    'notify party', 'port of loading', 'port of discharge',
    'vessel name', 'voyage no', 'on board', 'freight collect', 'freight prepaid',
    'master b/l', 'house b/l', 'original', 'negotiable',
    '선하증권', '송화인', '수화인', '선박명', '출발항', '도착항',
  ],
};

function score(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((s, kw) => {
    const hits = (lower.match(new RegExp(kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return s + hits * (kw.length > 8 ? 3 : kw.length > 5 ? 2 : 1);
  }, 0);
}

export function classifyText(text: string, filename = ''): {
  docType: ShipDocType;
  scores: Record<string, number>;
  detectedTypes: ShipDocType[];
} {
  const nameLower = filename.toLowerCase();

  // Filename takes priority (strongest signal)
  if (/\b(inv|invoice|인보이스)\b/.test(nameLower)) {
    return { docType: 'invoice', scores: {}, detectedTypes: ['invoice'] };
  }
  if (/\b(pl|packing|pack|패킹)\b/.test(nameLower)) {
    return { docType: 'packing_list', scores: {}, detectedTypes: ['packing_list'] };
  }
  if (/\b(b[_\-.]?l|bl|lading|선하증권|mbl|hbl)\b/.test(nameLower)) {
    return { docType: 'bl', scores: {}, detectedTypes: ['bl'] };
  }

  // Content scoring
  const scores: Record<string, number> = {
    invoice: score(text, KEYWORDS.invoice),
    packing_list: score(text, KEYWORDS.packing_list),
    bl: score(text, KEYWORDS.bl),
  };

  const maxScore = Math.max(...Object.values(scores));

  if (maxScore === 0) return { docType: 'other', scores, detectedTypes: ['other'] };

  // Detect types above 40% of max score → combined document
  const threshold = maxScore * 0.4;
  const detected = (Object.entries(scores)
    .filter(([, v]) => v >= threshold)
    .map(([k]) => k) as ShipDocType[]);

  if (detected.length >= 2) {
    return { docType: 'combined', scores, detectedTypes: detected };
  }

  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as ShipDocType;
  return { docType: winner, scores, detectedTypes: [winner] };
}

// Extract text from Excel workbook (all sheets)
export async function extractExcelText(buf: Buffer): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const parts: string[] = [];
  wb.worksheets.forEach(ws => {
    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const v = cell.value;
        if (v !== null && v !== undefined) {
          if (typeof v === 'object' && 'text' in (v as any)) parts.push(String((v as any).text));
          else if (typeof v === 'object' && 'result' in (v as any)) parts.push(String((v as any).result));
          else parts.push(String(v));
        }
      });
    });
  });
  return parts.join(' ');
}

// Extract text from PDF
export async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    const pdfParse = (pdfModule as any).default ?? pdfModule;
    const data = await pdfParse(buf);
    return data.text || '';
  } catch {
    return '';
  }
}
