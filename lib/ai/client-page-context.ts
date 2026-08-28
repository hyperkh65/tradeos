/** 클라이언트(브라우저)에서 안전하게 쓸 수 있는 순수 함수만 둔다 — DB/서버 전용
 * 모듈을 여기서 import하면 안 됨(플로팅 패널이 클라이언트 번들에 포함하므로). */

const MODULE_LABELS: Record<string, string> = {
  products: '제품', inspections: '검품', claims: '클레임', crm: '매출/견적', commissions: '커미션',
  'purchase-orders': '발주', shipments: '선적', imports: '수입통관', costs: '비용', inventory: '재고',
  companies: '거래처', 'forwarder-rates': '포워더운임', tasks: '업무', hr: '인사', expenses: '경비',
  documents: '문서', settings: '설정', 'approval-documents': '제품승인서', 'supplier-requests': '자료요청',
  contracts: '계약', mail: '메일', messenger: '메신저', files: '파일', scm: 'SCM', estimator: '견적계산',
};

const NON_ID_SEGMENTS = new Set(['print', 'ledger', 'settings', 'cert-print', 'expense-print', 'invoice-print', 'ai']);

export interface ClientPageContext { module?: string; entityType?: string; entityId?: string; title?: string; route: string }

export function inferPageContext(pathname: string): ClientPageContext {
  const segments = pathname.split('/').filter(Boolean);
  const moduleKey = segments[0] || '';
  const label = MODULE_LABELS[moduleKey];
  const second = segments[1];
  const entityId = second && !NON_ID_SEGMENTS.has(second) ? second : undefined;
  return {
    module: label || moduleKey || undefined,
    entityType: entityId ? label : undefined,
    entityId,
    title: label,
    route: pathname,
  };
}

export const SOURCE_TYPE_ROUTE: Record<string, string> = {
  product: '/products', inspection: '/inspections', claim: '/claims',
  company: '/companies', purchaseorder: '/purchase-orders', shipment: '/shipments',
  quote: '/quotes', sale: '/crm', expense: '/costs',
  inventory: '/inventory', import: '/imports', commission: '/commissions',
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  product: '제품', inspection: '검품', claim: '클레임', company: '거래처', purchaseorder: '발주', shipment: '선적',
  attachment: '첨부파일', quote: '견적', sale: '매출', expense: '비용', inventory: '재고',
  import: '수입통관', commission: '커미션', employee: '직원',
};

export interface DraftBlock { type: string; title?: string; content?: string; fields?: Record<string, unknown> }

/** 답변 안에 ```json {"type":"...", ...} ``` 블록이 있으면 초안으로 인식한다. */
export function extractDraftBlock(text: string): DraftBlock | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') return parsed as DraftBlock;
  } catch { /* JSON이 아니면 그냥 일반 텍스트로 취급 */ }
  return null;
}

export function stripDraftBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/, '').trim();
}
