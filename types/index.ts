// ─── Auth & Users ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'staff' | 'accounting' | 'purchasing' | 'sales' | 'quality' | 'logistics';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatar?: string;
  permissions: string[];
}

// ─── Companies ────────────────────────────────────────────────────────────────

export type CompanyType = '공급업체' | '고객사' | '포워더' | '관세사' | '시험기관' | '인증기관' | '기타';

export interface Company {
  id: string;
  businessId: string; // VEN-0001
  name: string;
  nameEn?: string;
  type: CompanyType;
  country: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  wechat?: string;
  memo?: string;
  ceo?: string;
  businessNo?: string;
  bank?: string;
  accountNo?: string;
  currency?: string;
  contactPerson?: string;
  bizRegFile?: string;
  bankCopyFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  wechat?: string;
  language?: string;
  isMain: boolean;
  memo?: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  businessId: string; // PRD-0001
  code: string;
  nameKo: string;
  nameEn?: string;
  nameZh?: string;
  category?: string;
  supplierId?: string;
  supplierName?: string;
  status: 'active' | 'inactive' | 'sample';
  thumbnail?: string;
  description?: string;
  specification?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  currency: string;
  moq?: number;
  leadTimeDays?: number;
  hsCode?: string;
  countryOfOrigin?: string;
  netWeight?: number;
  grossWeight?: number;
  cbm?: number;
  packaging?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

export interface Quote {
  id: string;
  businessId: string; // QT-2026-0001
  type: 'supplier' | 'customer';
  companyId: string;
  companyName: string;
  items: QuoteItem[];
  currency: string;
  incoterm?: string;
  paymentTerms?: string;
  validity?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  remark?: string;
  createdBy: string;
  createdAt: string;
}

export interface QuoteItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  moq?: number;
  leadTime?: string;
  samplePrice?: number;
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  businessId: string; // PO-2026-0001
  supplierId: string;
  supplierName: string;
  items: POItem[];
  currency: string;
  totalAmount: number;
  depositAmount?: number;
  balanceAmount?: number;
  paymentTerms?: string;
  orderDate: string;
  productionDueDate?: string;
  inspectionDate?: string;
  etd?: string;
  status: 'draft' | 'confirmed' | 'production' | 'inspection' | 'shipped' | 'completed' | 'cancelled';
  remark?: string;
  incoterm?: string;
  piNumber?: string;
  piFileUrl?: string;
  piStampedUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface POItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  specification?: string;
  qty: number;
  unitPrice: number;
  amount: number;
  cbm?: number;
  netWeight?: number;
  grossWeight?: number;
  packaging?: string;
}

// ─── Inspections ──────────────────────────────────────────────────────────────

export type InspectionResult = 'PASS' | 'RETEST' | 'FAIL' | 'PENDING';

export interface Inspection {
  id: string;
  businessId: string;
  poId?: string;
  poBusinessId?: string;
  supplierId?: string;
  supplierName: string;
  productId?: string;
  productName: string;
  productNameManual?: string;
  inspectionDate: string;
  inspector?: string;
  inspectionType: string;
  sampleQty: number;
  checkedQty?: number;
  passedQty?: number;
  failedQty?: number;
  defectRate?: number;
  result: InspectionResult;
  summary?: string;
  opinion?: string;
  reportFiles?: string[];
  imageFiles?: string[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'on_hold';
  createdAt: string;
}

// ─── Shipments ────────────────────────────────────────────────────────────────

export type ShipmentType = 'FCL' | 'LCL' | 'AIR' | 'COURIER';

export interface Shipment {
  id: string;
  businessId: string; // SHP-2026-0001
  type: ShipmentType;
  forwarderId?: string;
  forwarderName?: string;
  origin?: string;
  pol?: string;
  pod?: string;
  etd?: string;
  eta?: string;
  vessel?: string;
  voyage?: string;
  containerNo?: string;
  containerType?: string;
  blNo?: string;
  cbm?: number;
  grossWeight?: number;
  poIds: string[];
  status: 'booked' | 'departed' | 'in_transit' | 'arrived' | 'customs' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// ─── Imports ──────────────────────────────────────────────────────────────────

export interface Import {
  id: string;
  businessId: string; // IMP-2026-0001
  shipmentId: string;
  shipmentBusinessId: string;
  brokerId?: string;
  brokerName?: string;
  declarationNo?: string;
  releaseDate?: string;
  hsCode?: string;
  dutyRate?: number;
  duty?: number;
  vat?: number;
  brokerFee?: number;
  ftaApplicable: boolean;
  coStatus?: '미수령' | '수령' | '불필요';
  status: 'in_progress' | 'declared' | 'released' | 'completed';
  createdAt: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  businessId: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  amountKrw?: number;
  relatedType?: 'company' | 'product' | 'po' | 'shipment' | 'import' | 'claim';
  relatedId?: string;
  relatedName?: string;
  paidDate?: string;
  invoiceNo?: string;
  status: 'pending' | 'approved' | 'paid';
  createdBy: string;
  createdAt: string;
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export type ClaimIssueType = '품질' | '수량' | '파손' | '지연' | '사양' | '기타';

export interface Claim {
  id: string;
  businessId: string; // CLM-2026-0001
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  productId?: string;
  productName?: string;
  poId?: string;
  poBusinessId?: string;
  saleId?: string;
  saleBusinessId?: string;
  shipmentId?: string;
  issueType: ClaimIssueType;
  description: string;
  claimAmount?: number;
  currency?: string;
  compensationType?: '환불' | '차감' | '교환' | '크레딧' | '기타';
  compensationAmount?: number;
  status: '접수' | '내부확인' | '업체전달' | '협상' | '합의' | '완료';
  resolvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  collaboratorIds?: string[];
  dueDate?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: '해야 함' | '진행 중' | '대기' | '완료';
  relatedType?: string;
  relatedId?: string;
  relatedName?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeByte: number;
  storageProvider: 'nas' | 'cloud';
  nasPath?: string;
  backupPath?: string;
  publicUrl?: string;
  relatedType?: string;
  relatedId?: string;
  category?: string;
  version?: string;
  uploadedBy: string;
  uploadedAt: string;
  backupStatus: 'pending' | 'completed' | 'failed';
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  fileIds?: string[];
  replyToId?: string;
  mentions?: string[];
  createdAt: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'public' | 'private' | 'dm';
  memberIds: string[];
  description?: string;
  createdAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'message_mention'
  | 'task_assigned'
  | 'approval_request'
  | 'approval_result'
  | 'payment_due'
  | 'cert_expiry'
  | 'inspection_scheduled'
  | 'claim_update';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedType?: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface Approval {
  id: string;
  businessId: string;
  formType: string;
  formTitle: string;
  requesterId: string;
  requesterName: string;
  steps: ApprovalStep[];
  currentStep: number;
  status: '작성' | '진행 중' | '승인' | '반려';
  formData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  order: number;
  approverId: string;
  approverName: string;
  status: '대기' | '승인' | '반려';
  comment?: string;
  actedAt?: string;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
