import type { User, Company, Product, PurchaseOrder, Task, Inspection, Shipment, Claim, Expense, Quote, Import, Approval, Document, Message, Channel } from '@/types';

export const DEMO_USER: User = {
  id: 'user-1',
  name: '김대표',
  email: 'ceo@nexport.demo',
  role: 'admin',
  department: '경영',
  permissions: ['*'],
};

export const DEMO_COMPANIES: Company[] = [
  { id: 'c1', businessId: 'VEN-0001', name: 'Ningbo Alpha Lighting Co., Ltd.', nameEn: 'Ningbo Alpha Lighting', type: '공급업체', country: '중국', email: 'sales@alpha-lighting.demo', phone: '+86-574-8800-0001', wechat: 'alpha_james', createdAt: '2025-01-10T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
  { id: 'c2', businessId: 'VEN-0002', name: 'Shenzhen Nova Electric Co., Ltd.', nameEn: 'Nova Electric', type: '공급업체', country: '중국', email: 'sales@nova-elec.demo', phone: '+86-755-2200-0002', createdAt: '2025-02-15T00:00:00Z', updatedAt: '2026-05-10T00:00:00Z' },
  { id: 'c3', businessId: 'CUS-0001', name: '(주)한국에너지솔루션', nameEn: 'Korea Energy Solution', type: '고객사', country: '한국', email: 'purchase@kes.demo', phone: '02-1234-5678', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c4', businessId: 'CUS-0002', name: '대성전기(주)', type: '고객사', country: '한국', email: 'buy@daesung.demo', phone: '031-555-6789', createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z' },
  { id: 'c5', businessId: 'FWD-0001', name: '한진해운포워딩', type: '포워더', country: '한국', email: 'ops@hjforwarding.demo', phone: '02-9999-1234', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'c6', businessId: 'VEN-0003', name: 'Guangzhou Smart Home Co., Ltd.', nameEn: 'GZ Smart Home', type: '공급업체', country: '중국', email: 'export@gzsmarthome.demo', phone: '+86-20-3300-0003', wechat: 'gzsh_lily', createdAt: '2025-06-01T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
  { id: 'c7', businessId: 'CUS-0003', name: '삼성유통(주)', type: '고객사', country: '한국', email: 'import@samsung-dist.demo', phone: '02-7777-8888', createdAt: '2025-07-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' },
];

export const DEMO_PRODUCTS: Product[] = [
  { id: 'p1', businessId: 'PRD-0001', code: 'LPS-401', nameKo: 'LED 패널 40W 1x1', nameEn: 'LED Panel Light 40W 1x1', category: '조명', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', status: 'active', purchasePrice: 18.5, sellingPrice: 32000, currency: 'USD', moq: 500, leadTimeDays: 45, hsCode: '9405.10', countryOfOrigin: '중국', cbm: 0.012, netWeight: 3.2, grossWeight: 3.8, createdAt: '2025-01-15T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
  { id: 'p2', businessId: 'PRD-0002', code: 'TRK-602', nameKo: '트랙 라이트 30W', nameEn: 'Track Light 30W', category: '조명', supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', status: 'active', purchasePrice: 12.0, sellingPrice: 22000, currency: 'USD', moq: 200, leadTimeDays: 30, hsCode: '9405.10', countryOfOrigin: '중국', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
  { id: 'p3', businessId: 'PRD-0003', code: 'FAN-USB01', nameKo: 'USB 휴대용 선풍기', nameEn: 'USB Portable Fan', category: '가전', supplierId: 'c2', supplierName: 'Shenzhen Nova Electric', status: 'active', purchasePrice: 4.2, sellingPrice: 9900, currency: 'USD', moq: 1000, leadTimeDays: 25, countryOfOrigin: '중국', createdAt: '2025-03-10T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'p4', businessId: 'PRD-0004', code: 'EXT-4P2M', nameKo: '멀티탭 4구 2M', nameEn: 'Power Strip 4-outlet 2M', category: '전기', supplierId: 'c2', supplierName: 'Shenzhen Nova Electric', status: 'active', purchasePrice: 3.8, sellingPrice: 8500, currency: 'USD', moq: 500, leadTimeDays: 20, countryOfOrigin: '중국', createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' },
  { id: 'p5', businessId: 'PRD-0005', code: 'SH-WLS01', nameKo: '무선 스마트 스피커', nameEn: 'Wireless Smart Speaker', category: '스마트홈', supplierId: 'c6', supplierName: 'GZ Smart Home', status: 'active', purchasePrice: 22.0, sellingPrice: 45000, currency: 'USD', moq: 300, leadTimeDays: 35, countryOfOrigin: '중국', createdAt: '2025-06-15T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
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
  {
    id: 'po4', businessId: 'PO-2026-0033', supplierId: 'c6', supplierName: 'GZ Smart Home',
    items: [{ id: 'poi5', productId: 'p5', productCode: 'SH-WLS01', productName: '무선 스마트 스피커', qty: 300, unitPrice: 22.0, amount: 6600 }],
    currency: 'USD', totalAmount: 6600, depositAmount: 1980, balanceAmount: 4620,
    paymentTerms: '30% T/T, 70% on B/L', orderDate: '2026-07-20', productionDueDate: '2026-09-01', etd: '2026-09-15',
    status: 'confirmed', incoterm: 'FOB', createdBy: 'user-1', createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  },
];

export const DEMO_QUOTES: Quote[] = [
  {
    id: 'qt1', businessId: 'QT-2026-0018', type: 'customer', companyId: 'c3', companyName: '(주)한국에너지솔루션',
    items: [{ productId: 'p1', productName: 'LED 패널 40W 1x1', quantity: 500, unitPrice: 32000, moq: 200, leadTime: '45일' }],
    currency: 'KRW', incoterm: 'DAP Seoul', paymentTerms: 'Net 30', validity: '2026-09-01',
    status: 'sent', createdBy: 'user-1', createdAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'qt2', businessId: 'QT-2026-0017', type: 'supplier', companyId: 'c1', companyName: 'Ningbo Alpha Lighting',
    items: [
      { productId: 'p1', productName: 'LED 패널 40W 1x1', quantity: 2000, unitPrice: 17.5, moq: 500, leadTime: '40일' },
      { productId: 'p2', productName: '트랙 라이트 30W', quantity: 1000, unitPrice: 11.5, moq: 200, leadTime: '30일' },
    ],
    currency: 'USD', incoterm: 'FOB Ningbo', paymentTerms: '30% T/T', validity: '2026-08-31',
    status: 'accepted', createdBy: 'user-1', createdAt: '2026-07-25T00:00:00Z',
  },
  {
    id: 'qt3', businessId: 'QT-2026-0016', type: 'customer', companyId: 'c4', companyName: '대성전기(주)',
    items: [
      { productId: 'p3', productName: 'USB 휴대용 선풍기', quantity: 1000, unitPrice: 9900, moq: 500, leadTime: '30일' },
      { productId: 'p4', productName: '멀티탭 4구 2M', quantity: 500, unitPrice: 8500, moq: 300 },
    ],
    currency: 'KRW', validity: '2026-08-15', status: 'draft', createdBy: 'user-1', createdAt: '2026-07-20T00:00:00Z',
  },
  {
    id: 'qt4', businessId: 'QT-2026-0015', type: 'customer', companyId: 'c7', companyName: '삼성유통(주)',
    items: [{ productId: 'p5', productName: '무선 스마트 스피커', quantity: 200, unitPrice: 45000, moq: 100, leadTime: '40일' }],
    currency: 'KRW', validity: '2026-08-20', status: 'accepted', createdBy: 'user-1', createdAt: '2026-07-18T00:00:00Z',
  },
  {
    id: 'qt5', businessId: 'QT-2026-0013', type: 'customer', companyId: 'c3', companyName: '(주)한국에너지솔루션',
    items: [{ productId: 'p2', productName: '트랙 라이트 30W', quantity: 300, unitPrice: 22000 }],
    currency: 'KRW', validity: '2026-07-15', status: 'expired', createdBy: 'user-1', createdAt: '2026-06-15T00:00:00Z',
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
  {
    id: 'qc2', businessId: 'QC-2026-0025', poId: 'po3', poBusinessId: 'PO-2026-0028',
    supplierId: 'c1', supplierName: 'Ningbo Alpha Lighting', productId: 'p2', productName: '트랙 라이트 30W',
    inspectionDate: '2026-07-05', inspector: '박검품', inspectionType: '공장검품',
    sampleQty: 50, checkedQty: 50, passedQty: 50, failedQty: 0, defectRate: 0,
    result: 'PASS', summary: '전량 합격. 이상 없음.',
    status: 'completed', createdAt: '2026-07-05T08:00:00Z',
  },
  {
    id: 'qc3', businessId: 'QC-2026-0029', poId: 'po2', poBusinessId: 'PO-2026-0032',
    supplierId: 'c2', supplierName: 'Shenzhen Nova Electric', productId: 'p3', productName: 'USB 휴대용 선풍기',
    inspectionDate: '2026-08-12', inspector: '이품질', inspectionType: '공장검품',
    sampleQty: 100, checkedQty: 0, passedQty: 0, failedQty: 0,
    result: 'PENDING', summary: '',
    status: 'scheduled', createdAt: '2026-08-06T00:00:00Z',
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
  {
    id: 'shp2', businessId: 'SHP-2026-0033', type: 'FCL', forwarderId: 'c5', forwarderName: '한진해운포워딩',
    origin: '닝보', pol: 'CNNGB', pod: 'KRPUS', etd: '2026-07-10', eta: '2026-07-24',
    vessel: 'MSC MAYA', voyage: '202W28', blNo: 'MSCU2026071001',
    cbm: 25, grossWeight: 3200, poIds: ['po3'], status: 'completed',
    createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-25T00:00:00Z',
  },
];

export const DEMO_IMPORTS: Import[] = [
  {
    id: 'imp1', businessId: 'IMP-2026-0022', shipmentId: 'shp2', shipmentBusinessId: 'SHP-2026-0033',
    brokerName: '관세법인 대한', declarationNo: '2026-KRPUS-071024', releaseDate: '2026-07-25',
    hsCode: '9405.10', dutyRate: 8, duty: 576000, vat: 637000, brokerFee: 150000,
    ftaApplicable: true, coStatus: '수령', status: 'completed', createdAt: '2026-07-20T00:00:00Z',
  },
  {
    id: 'imp2', businessId: 'IMP-2026-0023', shipmentId: 'shp1', shipmentBusinessId: 'SHP-2026-0035',
    brokerName: '관세법인 대한',
    ftaApplicable: true, coStatus: '미수령', status: 'in_progress', createdAt: '2026-08-06T00:00:00Z',
  },
];

export const DEMO_TASKS: Task[] = [
  { id: 't1', title: 'PO-2026-0031 잔금 송금 준비', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-10', priority: 'high', status: '진행 중', relatedType: 'po', relatedId: 'po1', relatedName: 'PO-2026-0031', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' },
  { id: 't2', title: 'QC-2026-0028 보고서 고객사 전송', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-07', priority: 'urgent', status: '해야 함', relatedType: 'inspection', relatedId: 'qc1', relatedName: 'QC-2026-0028', createdAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' },
  { id: 't3', title: 'KC 인증서 갱신 신청 (LPS-401)', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-09-01', priority: 'medium', status: '해야 함', createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
  { id: 't4', title: 'Nova Electric 신제품 샘플 요청서 작성', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-12', priority: 'low', status: '해야 함', relatedType: 'company', relatedId: 'c2', relatedName: 'Shenzhen Nova Electric', createdAt: '2026-08-03T00:00:00Z', updatedAt: '2026-08-03T00:00:00Z' },
  { id: 't5', title: 'SHP-2026-0035 B/L Draft 확인', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-16', priority: 'high', status: '해야 함', relatedType: 'shipment', relatedId: 'shp1', relatedName: 'SHP-2026-0035', createdAt: '2026-08-06T00:00:00Z', updatedAt: '2026-08-06T00:00:00Z' },
  { id: 't6', title: 'GZ Smart Home 신규 거래처 등록', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-08', priority: 'medium', status: '완료', relatedType: 'company', relatedId: 'c6', relatedName: 'GZ Smart Home', createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-07T00:00:00Z' },
  { id: 't7', title: '삼성유통 견적서 QT-2026-0015 발송', ownerId: 'user-1', ownerName: '김대표', dueDate: '2026-08-05', priority: 'high', status: '완료', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' },
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
  {
    id: 'clm2', businessId: 'CLM-2026-0003', customerId: 'c4', customerName: '대성전기(주)',
    productId: 'p3', productName: 'USB 휴대용 선풍기',
    issueType: '파손', description: '운송 중 포장 파손으로 선풍기 날개 부분 크랙 발생 20개',
    claimAmount: 840, currency: 'USD', compensationType: '교환',
    status: '완료', createdBy: 'user-1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-30T00:00:00Z',
  },
];

export const DEMO_EXPENSES: Expense[] = [
  { id: 'exp1', businessId: 'EXP-2026-0041', category: '해상운임', description: 'PO-2026-0031 LCL 운임', amount: 850, currency: 'USD', exchangeRate: 1380, amountKrw: 1173000, relatedType: 'shipment', relatedId: 'shp1', relatedName: 'SHP-2026-0035', status: 'pending', createdBy: 'user-1', createdAt: '2026-08-06T00:00:00Z' },
  { id: 'exp2', businessId: 'EXP-2026-0040', category: '통관비', description: 'SHP-2026-0033 통관 대행', amount: 320000, currency: 'KRW', relatedType: 'import', relatedId: 'imp1', status: 'paid', paidDate: '2026-07-20', createdBy: 'user-1', createdAt: '2026-07-18T00:00:00Z' },
  { id: 'exp3', businessId: 'EXP-2026-0039', category: '검품비', description: 'QC-2026-0028 검품 대행 수수료', amount: 280000, currency: 'KRW', relatedType: 'po', relatedId: 'po1', relatedName: 'PO-2026-0031', status: 'paid', paidDate: '2026-08-06', createdBy: 'user-1', createdAt: '2026-08-05T00:00:00Z' },
  { id: 'exp4', businessId: 'EXP-2026-0038', category: '샘플비', description: 'GZ Smart Home 스마트 스피커 샘플 구입', amount: 132, currency: 'USD', exchangeRate: 1380, amountKrw: 182160, relatedType: 'company', relatedId: 'c6', relatedName: 'GZ Smart Home', status: 'paid', paidDate: '2026-07-22', createdBy: 'user-1', createdAt: '2026-07-20T00:00:00Z' },
];

export const DEMO_APPROVALS: Approval[] = [
  {
    id: 'apr1', businessId: 'APR-2026-0012', formType: '지출결의서', formTitle: 'SHP-2026-0035 해상운임 지급 승인',
    requesterId: 'user-1', requesterName: '김대표',
    steps: [
      { order: 1, approverId: 'user-2', approverName: '이팀장', status: '승인', comment: '확인 완료', actedAt: '2026-08-06T10:30:00Z' },
      { order: 2, approverId: 'user-3', approverName: '박대표이사', status: '대기' },
    ],
    currentStep: 2, status: '진행 중',
    formData: { amount: 1173000, category: '해상운임', expenseId: 'exp1' },
    createdAt: '2026-08-06T09:00:00Z', updatedAt: '2026-08-06T10:30:00Z',
  },
  {
    id: 'apr2', businessId: 'APR-2026-0011', formType: '발주승인', formTitle: 'PO-2026-0033 GZ Smart Home 발주 승인',
    requesterId: 'user-1', requesterName: '김대표',
    steps: [
      { order: 1, approverId: 'user-3', approverName: '박대표이사', status: '승인', comment: '진행하세요', actedAt: '2026-07-21T14:00:00Z' },
    ],
    currentStep: 1, status: '승인',
    formData: { poId: 'po4', amount: 6600, currency: 'USD' },
    createdAt: '2026-07-20T11:00:00Z', updatedAt: '2026-07-21T14:00:00Z',
  },
  {
    id: 'apr3', businessId: 'APR-2026-0010', formType: '계약서승인', formTitle: '(주)한국에너지솔루션 연간 공급계약 승인',
    requesterId: 'user-1', requesterName: '김대표',
    steps: [
      { order: 1, approverId: 'user-3', approverName: '박대표이사', status: '반려', comment: '단가 재협의 필요', actedAt: '2026-07-15T15:00:00Z' },
    ],
    currentStep: 1, status: '반려',
    formData: { customerId: 'c3', contractAmount: 50000000 },
    createdAt: '2026-07-14T09:00:00Z', updatedAt: '2026-07-15T15:00:00Z',
  },
];

export const DEMO_DOCS: Document[] = [
  { id: 'doc1', fileName: 'PO-2026-0031_발주서.pdf', fileType: 'application/pdf', fileSizeByte: 245000, storageProvider: 'nas', nasPath: '/nexport/documents/po/PO-2026-0031_발주서.pdf', relatedType: 'po', relatedId: 'po1', category: '발주서', uploadedBy: 'user-1', uploadedAt: '2026-06-15T09:05:00Z', backupStatus: 'completed' },
  { id: 'doc2', fileName: 'QC-2026-0028_검품보고서.pdf', fileType: 'application/pdf', fileSizeByte: 1230000, storageProvider: 'nas', nasPath: '/nexport/documents/qc/QC-2026-0028_검품보고서.pdf', relatedType: 'inspection', relatedId: 'qc1', category: '검품보고서', uploadedBy: 'user-1', uploadedAt: '2026-08-05T14:00:00Z', backupStatus: 'completed' },
  { id: 'doc3', fileName: 'LPS-401_KC인증서_2025.pdf', fileType: 'application/pdf', fileSizeByte: 580000, storageProvider: 'nas', nasPath: '/nexport/documents/cert/LPS-401_KC인증서_2025.pdf', relatedType: 'product', relatedId: 'p1', category: '인증서', uploadedBy: 'user-1', uploadedAt: '2025-09-01T10:00:00Z', backupStatus: 'completed' },
  { id: 'doc4', fileName: 'SHP-2026-0033_BL사본.pdf', fileType: 'application/pdf', fileSizeByte: 320000, storageProvider: 'nas', nasPath: '/nexport/documents/shp/SHP-2026-0033_BL사본.pdf', relatedType: 'shipment', relatedId: 'shp2', category: 'B/L', uploadedBy: 'user-1', uploadedAt: '2026-07-12T09:00:00Z', backupStatus: 'completed' },
  { id: 'doc5', fileName: '한국에너지솔루션_연간계약서_초안.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSizeByte: 98000, storageProvider: 'nas', nasPath: '/nexport/documents/contract/한국에너지솔루션_연간계약서_초안.docx', relatedType: 'company', relatedId: 'c3', category: '계약서', uploadedBy: 'user-1', uploadedAt: '2026-07-14T11:00:00Z', backupStatus: 'pending' },
  { id: 'doc6', fileName: 'Alpha_Lighting_Catalog_2026.pdf', fileType: 'application/pdf', fileSizeByte: 4200000, storageProvider: 'nas', nasPath: '/nexport/documents/catalog/Alpha_Lighting_Catalog_2026.pdf', relatedType: 'company', relatedId: 'c1', category: '카탈로그', uploadedBy: 'user-1', uploadedAt: '2026-01-10T08:00:00Z', backupStatus: 'completed' },
];

export const DEMO_CHANNELS: Channel[] = [
  { id: 'ch1', name: '전체 공지', type: 'public', memberIds: ['user-1', 'user-2', 'user-3'], description: '전사 공지 채널', createdAt: '2025-01-01T00:00:00Z' },
  { id: 'ch2', name: '무역팀', type: 'public', memberIds: ['user-1', 'user-2'], description: '무역 업무 채널', createdAt: '2025-01-01T00:00:00Z' },
  { id: 'ch3', name: '김대표 · 이팀장', type: 'dm', memberIds: ['user-1', 'user-2'], createdAt: '2025-01-01T00:00:00Z' },
];

export const DEMO_MESSAGES: Message[] = [
  { id: 'm1', channelId: 'ch1', senderId: 'user-3', senderName: '박대표이사', content: '이번 주 금요일 오전 10시에 전체 미팅 있습니다. 준비 부탁드립니다.', createdAt: '2026-08-07T09:00:00Z' },
  { id: 'm2', channelId: 'ch2', senderId: 'user-2', senderName: '이팀장', content: 'PO-0031 검품 결과 조건부 합격 나왔습니다. 조건 충족 확인 후 선적 진행하겠습니다.', createdAt: '2026-08-05T15:30:00Z' },
  { id: 'm3', channelId: 'ch2', senderId: 'user-1', senderName: '김대표', content: '알겠습니다. Alpha 측에 재검 기한 8/10까지 요청해주세요.', createdAt: '2026-08-05T15:45:00Z' },
  { id: 'm4', channelId: 'ch2', senderId: 'user-2', senderName: '이팀장', content: '네, 바로 연락하겠습니다. 한에솔 쪽에도 보고서 먼저 공유할까요?', createdAt: '2026-08-05T15:50:00Z' },
  { id: 'm5', channelId: 'ch3', senderId: 'user-2', senderName: '이팀장', content: '대표님, GZ Smart Home 계약서 검토 완료했습니다. 확인 부탁드립니다.', createdAt: '2026-08-06T14:00:00Z' },
  { id: 'm6', channelId: 'ch3', senderId: 'user-1', senderName: '김대표', content: '내일 오전에 같이 보죠.', createdAt: '2026-08-06T14:30:00Z' },
];

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'deadline' | 'meeting' | 'inspection' | 'shipment' | 'payment' | 'event';
}

export const DEMO_CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'ev1', title: 'PO-0031 검품일', date: '2026-08-05', type: 'inspection' },
  { id: 'ev2', title: '잔금 송금 마감', date: '2026-08-10', type: 'payment' },
  { id: 'ev7', title: '전체 미팅', date: '2026-08-08', type: 'meeting' },
  { id: 'ev3', title: 'QC-0029 검품 예정', date: '2026-08-12', type: 'inspection' },
  { id: 'ev4', title: 'Nova Electric 샘플 요청', date: '2026-08-12', type: 'deadline' },
  { id: 'ev9', title: 'PO-0032 생산 마감', date: '2026-08-10', type: 'deadline' },
  { id: 'ev5', title: 'SHP-0035 ETD (닝보 출발)', date: '2026-08-15', type: 'shipment' },
  { id: 'ev6', title: 'B/L Draft 확인', date: '2026-08-16', type: 'deadline' },
  { id: 'ev10', title: 'PO-0032 ETD', date: '2026-08-25', type: 'shipment' },
  { id: 'ev8', title: 'SHP-0035 ETA (부산 입항)', date: '2026-08-28', type: 'shipment' },
  { id: 'ev11', title: 'KC인증 갱신 마감', date: '2026-09-01', type: 'deadline' },
];

export interface MailItem {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  tag?: string;
}

export const DEMO_MAILS: MailItem[] = [
  {
    id: 'mail1', from: 'James Li (Alpha Lighting)', fromEmail: 'james@alpha-lighting.demo',
    subject: 'RE: QC Report - PO-2026-0031 Conditional Pass',
    preview: 'Dear Kim, Thanks for the QC report. We will re-inspect the 3 scratched panels...',
    body: 'Dear Kim,\n\nThanks for sharing the QC report for PO-2026-0031.\n\nWe have identified the 3 panels with surface scratches and will re-inspect them before shipment on August 10th.\n\nPlease confirm if you need us to send photos of the corrected products before proceeding.\n\nBest regards,\nJames Li\nNingbo Alpha Lighting Co., Ltd.',
    date: '2026-08-06T11:20:00Z', read: false, starred: true, tag: '공급업체',
  },
  {
    id: 'mail2', from: '이구매 (한국에너지솔루션)', fromEmail: 'purchase@kes.demo',
    subject: 'LED 패널 추가 견적 요청',
    preview: '안녕하세요. 이번에 2분기 추가 물량으로 LED 패널 500개 추가 견적 부탁드립니다...',
    body: '안녕하세요 김대표님,\n\n당사 2분기 추가 물량으로 LED 패널 40W 1x1 500개 추가 견적 부탁드립니다.\n\n납기는 9월말까지 희망합니다.\n\n감사합니다.\n이구매 드림\n(주)한국에너지솔루션 구매팀',
    date: '2026-08-06T09:15:00Z', read: false, starred: false, tag: '고객사',
  },
  {
    id: 'mail3', from: '한진해운포워딩', fromEmail: 'ops@hjforwarding.demo',
    subject: 'SHP-2026-0035 선적 예약 확인서',
    preview: 'SHP-2026-0035 건 선적 예약이 완료되었습니다. ETD 8/15 CNNGB→KRPUS...',
    body: '안녕하세요 김대표님,\n\nSHP-2026-0035 건 선적 예약 확인드립니다.\n\n- 선박: EVER GLORY\n- 항차: 202W34\n- 출항일(ETD): 2026-08-15 CNNGB\n- 도착예정(ETA): 2026-08-28 KRPUS\n- B/L No: HJKU2026083501\n\nB/L Draft는 출항 후 2일 내 발송 예정입니다.\n\n감사합니다.\n한진해운포워딩',
    date: '2026-08-05T16:30:00Z', read: true, starred: false, tag: '포워더',
  },
  {
    id: 'mail4', from: 'Lily Wang (GZ Smart Home)', fromEmail: 'export@gzsmarthome.demo',
    subject: 'New Product Sample - Wireless Smart Speaker SH-WLS01',
    preview: 'Hi Kim, Please find attached the product catalog and price list for our new...',
    body: 'Hi Kim,\n\nHope you are doing well!\n\nPlease find attached our latest product catalog for the 2026 Smart Speaker line.\n\nFor the SH-WLS01 Wireless Smart Speaker:\n- Unit Price: USD 22.00 (MOQ 300)\n- Lead time: 35 days\n- Certification: CE, FCC, KC\n\nLet me know if you need samples. We can send 2 pcs free of charge.\n\nBest,\nLily Wang\nGZ Smart Home',
    date: '2026-08-04T08:00:00Z', read: true, starred: true, tag: '공급업체',
  },
  {
    id: 'mail5', from: '관세법인 대한', fromEmail: 'customs@daehan-customs.demo',
    subject: 'IMP-2026-0022 통관 완료 및 세금계산서',
    preview: 'SHP-2026-0033 통관이 완료되었습니다. 관세 576,000원, 부가세 637,000원...',
    body: 'SHP-2026-0033 수입통관이 완료되었습니다.\n\n- 신고번호: 2026-KRPUS-071024\n- 반출일: 2026-07-25\n- 관세: 576,000원\n- 부가세: 637,000원\n- 대행수수료: 150,000원\n\n세금계산서는 이메일로 별도 발송 예정입니다.\n\n감사합니다.\n관세법인 대한',
    date: '2026-07-25T14:00:00Z', read: true, starred: false, tag: '관세사',
  },
];

export const DEMO_STATS = {
  activePOs: DEMO_PURCHASE_ORDERS.filter(p => !['completed', 'cancelled'].includes(p.status)).length,
  pendingPayments: 2,
  upcomingShipments: DEMO_SHIPMENTS.filter(s => s.status === 'booked').length,
  pendingTasks: DEMO_TASKS.filter(t => t.status !== '완료').length,
  pendingApprovals: DEMO_APPROVALS.filter(a => a.status === '진행 중').length,
  openClaims: DEMO_CLAIMS.filter(c => c.status !== '완료').length,
};
