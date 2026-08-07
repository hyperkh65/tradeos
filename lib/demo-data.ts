import type { User, Company, Product, PurchaseOrder, Task, Inspection, Shipment, Claim, Expense } from '@/types';

export const DEMO_USER: User = {
  id: 'user-1',
  name: '김대표',
  email: 'ceo@tradeos.demo',
  role: 'admin',
  department: '경영',
  permissions: ['*'],
};

export const DEMO_COMPANIES: Company[] = [
  { id: 'c1', businessId: 'VEN-0001', name: 'Ningbo Alpha Lighting Co., Ltd.', nameEn: 'Ningbo Alpha Lighting', type: '공급업체', country: '중국', email: 'sales@alpha-lighting.demo', phone: '+86-574-8800-0001', wechat: 'alpha_james', createdAt: '2025-01-10T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
  { id: 'c2', businessId: 'VEN-0002', name: 'Shenzhen Nova Electric Co., Ltd.', nameEn: 'Nova Electric', type: '공급업체', country: '중국', email: 'sales@nova-elec.demo', phone: '+86-755-2200-0002', createdAt: '2025-02-15T00:00:00Z', updatedAt: '2026-05-10T00:00:00Z' },
  { id: 'c3', businessId: 'CUS-0001', name: '(주)한국에너지솔루션', nameEn: 'Korea Energy Solution', type: '고객사', country: '한국', email: 'purchase@kes.demo', phone: '02-1234-5678', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c4', businessId: 'CUS-0002', name: '대성전기(주)', type: '고객사', country: '한국', email: 'buy@daesung.demo', createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z' },
  { id: 'c5', businessId: 'FWD-0001', name: '한진해운포워딩', type: '포워더', country: '한국', email: 'ops@hjforwarding.demo', phone: '02-9999-1234', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

export const DEMO_PRODUCTS: Product[] = [
  { id: 'p1', businessId: 'PRD-0001', code: 'LPS-401', nameKo: 'LED 패널 40W 1x1', nameEn: 'LED Panel Light 40W 1x1', category: '조명', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', status: 'active', purchasePrice: 18.5, sellingPrice: 32000, currency: 'USD', moq: 500, leadTimeDays: 45, hsCode: '9405.10', countryOfOrigin: '중국', cbm: 0.012, netWeight: 3.2, grossWeight: 3.8, createdAt: '2025-01-15T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
  { id: 'p2', businessId: 'PRD-0002', code: 'TRK-602', nameKo: '트랙 라이트 30W', nameEn: 'Track Light 30W', category: '조명', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', status: 'active', purchasePrice: 12.0, sellingPrice: 22000, currency: 'USD', moq: 200, leadTimeDays: 30, hsCode: '9405.10', countryOfOrigin: '중국', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
  { id: 'p3', businessId: 'PRD-0003', code: 'FAN-USB01', nameKo: 'USB 휴대용 선풍기', nameEn: 'USB Portable Fan', category: '가전', supplierId: 'c2', supplierName: 'Shenzhen Nova Electric', status: 'active', purchasePrice: 4.2, sellingPrice: 9900, currency: 'USD', moq: 1000, leadTimeDays: 25, countryOfOrigin: '중국', createdAt: '2025-03-10T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'p4', businessId: 'PRD-0004', code: 'EXT-4P2M', nameKo: '멀티탭 4구 2M', nameEn: 'Power Strip 4-outlet 2M', category: '전기', supplierId: 'c2', supplierName: 'Shenzhen Nova Electric', status: 'active', purchasePrice: 3.8, sellingPrice: 8500, currency: 'USD', moq: 500, leadTimeDays: 20, countryOfOrigin: '중국', createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' },
];

export const DEMO_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'po1', businessId: 'PO-2026-0031', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting',
    items: [{ id: 'poi1', productId: 'p1', productCode: 'LPS-401', productName: 'LED 패널 40W 1x1', qty: 1000, unitPrice: 18.5, amount: 18500, cbm: 12 }],
    currency: 'USD', totalAmount: 18500, depositAmount: 5550, balanceAmount: 12950,
    paymentTerms: '30% Deposit, 70% against B/L copy', orderDate: '2026-06-15', productionDueDate: '2026-07-31', inspectionDate: '2026-08-05', etd: '2026-08-15',
    status: 'inspection', incoterm: 'FOB', remark: '긴급 주문 - 납기 엄수', createdBy: 'user-1', createdAt: '2026-06-15T09:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'po2', businessId: 'PO-2026-0032', supplierId: 'c2', supplierName: 'Shenzhen Nova Electric',
    items: [
      { id: 'poi2', productId: 'p3', productCode: 'FAN-USB01', productName: 'USB 휴대용 선풍기', qty: 2000, unitPrice: 4.2, amount: 8400 },
      { id: 'poi3', productId: 'p4', productCode: 'EXT-4P2M', productName: '멀티탭 4구 2M', qty: 500, unitPrice: 3.8, amount: 1900 },
    ],
    currency: 'USD', totalAmount: 10300, depositAmount: 3090, balanceAmount: 7210,
    paymentTerms: '30% T/T advance, 70% T/T before shipment', orderDate: '2026-07-01', productionDueDate: '2026-08-10', etd: '2026-08-25',
    status: 'production', incoterm: 'EXW', createdBy: 'user-1', createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-15T00:00:00Z',
  },
  {
    id: 'po3', businessId: 'PO-2026-0028', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting',
    items: [{ id: 'poi4', productId: 'p2', productCode: 'TRK-602', productName: '트랙 라이트 30W', qty: 500, unitPrice: 12.0, amount: 6000 }],
    currency: 'USD', totalAmount: 6000, depositAmount: 1800, balanceAmount: 4200,
    paymentTerms: '30% T/T, 70% against B/L copy', orderDate: '2026-05-20', etd: '2026-07-10', status: 'shipped',
    incoterm: 'FOB', createdBy: 'user-1', createdAt: '2026-05-20T00:00:00Z', updatedAt: '2026-07-10T00:00:00Z',
  },
];

export const DEMO_INSPECTIONS: Inspection[] = [
  {
    id: 'qc1', businessId: 'QC-2026-0028', poId: 'po1', poBusinessId: 'PO-2026-0031',
    supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', productId: 'p1', productName: 'LED 패널 40W 1x1',
    inspectionDate: '2026-08-05', inspector: '박검품', inspectionType: '공장검품',
    sampleQty: 80, checkedQty: 80, passedQty: 77, failedQty: 3, defectRate: 3.75,
    result: 'CONDITIONAL_PASS', summary: '외관 스크래치 3개 발견. 공장 재검 후 출하 조건 합격.',
    status: 'completed', createdAt: '2026-08-05T08:00:00Z',
  },
];

export const DEMO_SHIPMENTS: Shipment[] = [
  {
    id: 'shp1', businessId: 'SHP-2026-0035', type: 'LCL', forwarderId: 'c5', forwarderName: '한진해운포워딩',
    origin: '닝보', pol: 'CNNGB', pod: 'KRPUS', etd: '2026-08-15', eta: '2026-08-28',
    vessel: 'EVER GLORY', voyage: '202W34', blNo: 'HJKU2026083501',
    cbm: 18, grossWeight: 4200, poIds: ['po1'], status: 'booked',
    createdAt: '2026-08-06T00:00:00Z', updatedAt: '2026-08-06T00:00:00Z',
  },
];

export const DEMO_TASKS: Task[] = [
  { id: 't1', title: 'PO-2026-0031 잔금 송금 준비', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-10', priority: 'high', status: '진행 중', relatedType: 'po', relatedId: 'po1', relatedName: 'PO-2026-0031', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' },
  { id: 't2', title: 'QC-2026-0028 보고서 고객사 전송', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-07', priority: 'urgent', status: '해야 함', relatedType: 'inspection', relatedId: 'qc1', relatedName: 'QC-2026-0028', createdAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' },
  { id: 't3', title: 'KC 인증서 갱신 신청 (LPS-401)', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-09-01', priority: 'medium', status: '해야 함', createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
  { id: 't4', title: 'Nova Electric 신제품 샘플 요청서 작성', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-12', priority: 'low', status: '해야 함', relatedType: 'company', relatedId: 'c2', relatedName: 'Shenzhen Nova Electric', createdAt: '2026-08-03T00:00:00Z', updatedAt: '2026-08-03T00:00:00Z' },
  { id: 't5', title: 'SHP-2026-0035 B/L Draft 확인', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-16', priority: 'high', status: '해야 함', relatedType: 'shipment', relatedId: 'shp1', relatedName: 'SHP-2026-0035', createdAt: '2026-08-06T00:00:00Z', updatedAt: '2026-08-06T00:00:00Z' },
];

export const DEMO_CLAIMS: Claim[] = [
  {
    id: 'clm1', businessId: 'CLM-2026-0004', customerId: 'c3', customerName: '(주)한국에너지솔루션',
    supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', productId: 'p1', productName: 'LED 패널 40W 1x1',
    poId: 'po3', poBusinessId: 'PO-2026-0028', issueType: '품질',
    description: '수령 제품 중 50개 광속 불량 (기준: 4000lm 이상, 실측: 3600~3700lm)',
    claimAmount: 1200, currency: 'USD', compensationType: '차감', compensationAmount: 1200,
    status: '업체전달', createdBy: 'user-1', createdAt: '2026-07-25T00:00:00Z', updatedAt: '2026-07-28T00:00:00Z',
  },
];

export const DEMO_EXPENSES: Expense[] = [
  { id: 'exp1', businessId: 'EXP-2026-0041', category: '해상운임', description: 'PO-2026-0031 LCL 운임', amount: 850, currency: 'USD', exchangeRate: 1380, amountKrw: 1173000, relatedType: 'shipment', relatedId: 'shp1', relatedName: 'SHP-2026-0035', status: 'pending', createdBy: 'user-1', createdAt: '2026-08-06T00:00:00Z' },
  { id: 'exp2', businessId: 'EXP-2026-0040', category: '통관비', description: 'SHP-2026-0033 통관 대행', amount: 320000, currency: 'KRW', relatedType: 'import', relatedId: 'imp1', status: 'paid', paidDate: '2026-07-20', createdBy: 'user-1', createdAt: '2026-07-18T00:00:00Z' },
];

export const DEMO_STATS = {
  activePOs: DEMO_PURCHASE_ORDERS.filter(p => !['completed', 'cancelled'].includes(p.status)).length,
  pendingPayments: 2,
  upcomingShipments: 1,
  openClaims: 1,
  pendingTasks: DEMO_TASKS.filter(t => t.status !== '완료').length,
  pendingApprovals: 1,
};
