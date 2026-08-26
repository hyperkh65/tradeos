// 문서 양식 레지스트리 - 새 양식이 추가되면 여기에 한 항목만 추가하면 허브 페이지에 자동으로 나타남
export interface DocumentTemplate {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: 'richtext' | 'structured';
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'official',
    label: '공문서작성',
    description: '수신/발신/제목을 입력하고 본문을 자유롭게 편집(표·이미지 포함)하는 일반 공문 양식',
    href: '/documents/official',
    kind: 'richtext',
  },
  {
    id: 'import_cost_settlement',
    label: '수입물품대금비용정산서',
    description: '품목별 CNY 단가·수량과 선금/잔금 환율을 입력하면 KRW 정산액을 자동 계산하는 양식',
    href: '/documents/import-cost-settlement',
    kind: 'structured',
  },
  {
    id: 'rfq',
    label: '견적 의뢰서',
    description: '공급사에 품목별 견적을 요청하는 문서. 품목/규격/수량 입력 후 PDF·Excel로 발송',
    href: '/documents/rfq',
    kind: 'structured',
  },
  {
    id: 'sample_request',
    label: '샘플 의뢰서',
    description: '공급사에 샘플을 요청하는 문서. 품목별 무상/유상 구분과 금액을 함께 기재 (국/영문 병기)',
    href: '/documents/sample-request',
    kind: 'structured',
  },
];
