import path from 'path';
import { getDb } from './db/sqlite';

export interface AggregatedFile {
  category: string;
  sourceLabel: string;
  label: string;
  url: string;
  diskPath: string | null; // null = 다운로드 링크만 있고 zip에는 못 담는 항목(온디맨드 생성물)
  size?: number;
  uploadedAt?: string;
}

const base = (name: string) =>
  process.env.UPLOAD_DIR
    ? path.join(process.env.UPLOAD_DIR, name)
    : process.env.NODE_ENV === 'production'
      ? `/volume1/web/tradeos/data/uploads/${name}`
      : path.join(process.cwd(), 'data/uploads', name);

const UPLOAD_BASE = {
  purchaseOrders: base('purchase-orders'),
  pi: base('pi'),
  shipments: base('shipments'),
  imports: base('imports'),
  costs: base('costs'),
};

function urlFilename(url: string): string {
  return url.split('/').filter(Boolean).pop() || '';
}

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: '인보이스', packing_list: '패킹리스트', bl: 'B/L', combined: '혼합', co: 'C/O', other: '기타',
  clearance_cert: '수입신고필증', tax_bill: '납부고지서', inspection: '검사증', freight_invoice: '운임인보이스',
  warehouse_bill: '보관료청구서', broker_invoice: '관세사비용',
};

export function getProfitAnalysisDocuments(profitAnalysisId: string): {
  files: AggregatedFile[];
  context: { saleBizId?: string; importBizId?: string; shipmentBizId?: string; poBizIds: string[] };
} {
  const db = getDb();
  const pa = db.prepare('SELECT * FROM profit_analyses WHERE id=?').get(profitAnalysisId) as Record<string, unknown> | undefined;
  if (!pa) return { files: [], context: { poBizIds: [] } };

  const files: AggregatedFile[] = [];
  const context: { saleBizId?: string; importBizId?: string; shipmentBizId?: string; poBizIds: string[] } = { poBizIds: [] };

  // ── 수익분석표 인쇄본 (온디맨드 생성, 저장된 파일 아님) ──
  files.push({
    category: '수익분석',
    sourceLabel: (pa.business_id as string) || '',
    label: '수익분석표 (Excel)',
    url: `/api/profit-analysis/${profitAnalysisId}/excel`,
    diskPath: null,
  });

  // ── 매출 ──
  if (pa.sale_id) {
    const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(pa.sale_id as string) as Record<string, unknown> | undefined;
    if (sale) {
      context.saleBizId = sale.business_id as string;
      // 매출거래명세표: 별도 생성기가 아직 없음 - 향후 추가 필요
    }
  }

  // ── 통관 → 선적 → 발주(들) ──
  if (pa.import_id) {
    const imp = db.prepare('SELECT * FROM imports WHERE id=?').get(pa.import_id as string) as Record<string, unknown> | undefined;
    if (imp) {
      context.importBizId = imp.business_id as string;
      const importDocs: Array<{ filename: string; originalName: string; docType: string; customName?: string; url: string; size?: number; uploadedAt?: string }> =
        (() => { try { return JSON.parse((imp.documents_json as string) || '[]'); } catch { return []; } })();
      for (const d of importDocs) {
        files.push({
          category: '통관서류',
          sourceLabel: context.importBizId || '',
          label: d.customName || `${DOC_TYPE_LABEL[d.docType] || d.docType} - ${d.originalName}`,
          url: d.url,
          diskPath: path.join(UPLOAD_BASE.imports, pa.import_id as string, d.filename),
          size: d.size,
          uploadedAt: d.uploadedAt,
        });
      }

      // 관세사비용 등 - 이 통관건에 연결된 비용원장 첨부파일
      const costRecords = db.prepare('SELECT * FROM cost_records WHERE import_id=?').all(pa.import_id as string) as Record<string, unknown>[];
      for (const cr of costRecords) {
        const crFiles: Array<{ id: string; originalName: string; filename: string; url: string; size?: number; uploadedAt?: string }> =
          (() => { try { return JSON.parse((cr.files_json as string) || '[]'); } catch { return []; } })();
        for (const f of crFiles) {
          files.push({
            category: '비용증빙',
            sourceLabel: (cr.business_id as string) || '',
            label: `[${cr.cost_type}] ${f.originalName}`,
            url: f.url,
            diskPath: path.join(UPLOAD_BASE.costs, cr.id as string, f.filename),
            size: f.size,
            uploadedAt: f.uploadedAt,
          });
        }
      }

      // 선적 서류 (B/L, C/O 등)
      if (imp.shipment_id) {
        const shipment = db.prepare('SELECT * FROM shipments WHERE id=?').get(imp.shipment_id as string) as Record<string, unknown> | undefined;
        if (shipment) {
          context.shipmentBizId = shipment.business_id as string;
          const shipDocs: Array<{ filename: string; originalName: string; docType: string; customName?: string; url: string; size?: number; uploadedAt?: string }> =
            (() => { try { return JSON.parse((shipment.documents_json as string) || '[]'); } catch { return []; } })();
          for (const d of shipDocs) {
            files.push({
              category: '선적서류',
              sourceLabel: context.shipmentBizId || '',
              label: d.customName || `${DOC_TYPE_LABEL[d.docType] || d.docType} - ${d.originalName}`,
              url: d.url,
              diskPath: path.join(UPLOAD_BASE.shipments, imp.shipment_id as string, d.filename),
              size: d.size,
              uploadedAt: d.uploadedAt,
            });
          }

          // 이 선적에 묶인 발주(PO)들의 이미지/PI
          const poIds: string[] = (() => { try { return JSON.parse((shipment.po_ids_json as string) || '[]'); } catch { return []; } })();
          for (const poId of poIds) {
            const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(poId) as Record<string, unknown> | undefined;
            if (!po) continue;
            context.poBizIds.push(po.business_id as string);

            const images: string[] = (() => { try { return JSON.parse((po.images_json as string) || '[]'); } catch { return []; } })();
            images.forEach((url, i) => {
              files.push({
                category: '발주(PO)',
                sourceLabel: po.business_id as string,
                label: `PO 이미지 ${i + 1}`,
                url,
                diskPath: path.join(UPLOAD_BASE.purchaseOrders, poId, urlFilename(url)),
              });
            });

            if (po.pi_file_url) {
              files.push({
                category: '발주(PO)',
                sourceLabel: po.business_id as string,
                label: `PI (${po.pi_number || po.business_id})`,
                url: po.pi_file_url as string,
                diskPath: path.join(UPLOAD_BASE.pi, poId, urlFilename(po.pi_file_url as string)),
              });
            }
            if (po.pi_stamped_url) {
              files.push({
                category: '발주(PO)',
                sourceLabel: po.business_id as string,
                label: `PI 서명본 (${po.pi_number || po.business_id})`,
                url: po.pi_stamped_url as string,
                diskPath: path.join(UPLOAD_BASE.pi, poId, urlFilename(po.pi_stamped_url as string)),
              });
            }
          }
        }
      }
    }
  }

  return { files, context };
}
