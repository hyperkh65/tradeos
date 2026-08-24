import { renderToBuffer } from '@react-pdf/renderer';
import { getDb } from '@/lib/db/sqlite';
import { getCompanySettings, resolveCompanyAssetPath } from './company';
import { SalesStatementDoc, type SaleItem } from './sales-statement';
import { PurchaseOrderDoc, type POItem } from './purchase-order';
import { ProfitAnalysisDoc } from './profit-analysis';
import { OfficialDocumentDoc } from './official-document';
import { ImportCostSettlementDoc } from './import-cost-settlement';
import { TradeStatementCustomDoc } from './trade-statement-custom';
import { calcTradeStatementTotals, type TradeStatementItem } from '@/lib/trade-statement';

export async function generateSalesStatementPdf(saleId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const items: SaleItem[] = (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })();
  const company = getCompanySettings();
  const customer = db.prepare('SELECT * FROM companies WHERE name=?').get(row.customer as string) as Record<string, unknown> | undefined;
  const netAmount = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vat = (row.vat as number) || Math.round(netAmount * 0.1);
  const total = (row.total_amount as number) || netAmount + vat;

  return renderToBuffer(SalesStatementDoc({
    businessId: row.business_id as string,
    saleDate: row.sale_date as string,
    saleType: row.sale_type as string,
    poNo: row.po_no as string | undefined,
    customer: row.customer as string,
    salesperson: row.salesperson as string | undefined,
    misc: row.misc as string | undefined,
    items, netAmount, vat, total, company,
    customerCo: customer as { business_no?: string; ceo?: string; address?: string; phone?: string } | undefined,
    stampPath: resolveCompanyAssetPath(company.stampUrl),
  }));
}

export async function generatePurchaseOrderPdf(poId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(poId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const items: POItem[] = (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })();
  const currency = (row.currency as string) || 'USD';
  const totalAmount = (row.total_amount as number) || items.reduce((s, i) => s + (i.amount || i.unitPrice * ((i.qty || i.quantity) || 0) || 0), 0);
  const depositRatio = Number(row.deposit_ratio) || 30;
  const depositAmount = (row.deposit_amount as number) || Math.round(totalAmount * depositRatio / 100 * 100) / 100;
  const balanceAmount = (row.balance_amount as number) || totalAmount - depositAmount;

  const supplier = row.supplier_id
    ? db.prepare('SELECT * FROM companies WHERE id=?').get(row.supplier_id as string) as Record<string, unknown> | undefined
    : undefined;

  const company = getCompanySettings();

  return renderToBuffer(PurchaseOrderDoc({
    businessId: row.business_id as string,
    orderDate: row.order_date as string,
    etd: row.etd as string | undefined,
    supplierName: row.supplier_name as string,
    supplierCo: supplier ? {
      ceo: supplier.ceo as string | undefined,
      address: supplier.address as string | undefined,
      phone: supplier.phone as string | undefined,
      email: supplier.email as string | undefined,
      wechat: supplier.wechat as string | undefined,
    } : undefined,
    currency, items, totalAmount,
    depositRatio, depositAmount, balanceAmount,
    paymentTerms: row.payment_terms as string | undefined,
    incoterm: row.incoterm as string | undefined,
    remark: row.remark as string | undefined,
    company,
    companyLogoPath: resolveCompanyAssetPath(company.logoUrl),
    stampPath: resolveCompanyAssetPath(company.stampUrl),
  }));
}

export async function generateProfitAnalysisPdf(paId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profit_analyses WHERE id=?').get(paId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const pa = {
    title: row.title as string,
    analysisDate: (row.analysis_date as string) || '',
    customerName: (row.customer_name as string) || '',
    supplierName: (row.supplier_name as string) || '',
    importBusinessId: (row.import_business_id as string) || '',
    saleAmount: (row.sale_amount as number) || 0,
    customsExRate: (row.customs_ex_rate as number) || 0,
    wireExRate: (row.wire_ex_rate as number) || 0,
    freightCost: (row.freight_cost as number) || 0,
    inlandFreight: (row.inland_freight as number) || 0,
    brokerFee: (row.broker_fee as number) || 0,
    duty: (row.duty as number) || 0,
    vatImport: (row.vat_import as number) || 0,
    wireFee: (row.wire_fee as number) || 0,
    advancePayment: (row.advance_payment as number) || 0,
    paymentAmount: (row.payment_amount as number) || 0,
    productItems: (() => { try { return JSON.parse((row.product_items_json as string) || '[]'); } catch { return []; } })() as { name: string; spec?: string; qty: number; unitPriceFx: number; totalKrwManual?: number }[],
    extraCosts: (() => { try { return JSON.parse((row.extra_costs_json as string) || '[]'); } catch { return []; } })() as { name: string; amount: number }[],
  };

  const cex = pa.customsExRate || 1;
  const wex = pa.wireExRate || cex;

  let productTotalKrw = 0;
  let productTotalRmb = 0;
  const dateStr = pa.analysisDate ? `${new Date(pa.analysisDate).getMonth() + 1}/${new Date(pa.analysisDate).getDate()}` : '';
  const productItems = pa.productItems.map(item => {
    const krw = item.totalKrwManual ?? Math.round((item.qty || 0) * (item.unitPriceFx || 0) * cex);
    const rmb = item.totalKrwManual ? null : (item.qty || 0) * (item.unitPriceFx || 0);
    productTotalKrw += item.totalKrwManual ? item.totalKrwManual : Math.round((item.qty || 0) * (item.unitPriceFx || 0) * wex);
    if (rmb != null) productTotalRmb += rmb;
    return { label: `${dateStr}  ${item.name}${item.spec ? ' ' + item.spec : ''}`, qty: item.qty || 0, krw: krw || null, rmb };
  });

  const extraTotal = pa.extraCosts.reduce((s, c) => s + (c.amount || 0), 0);
  const logisticTotal = pa.freightCost + pa.inlandFreight + pa.brokerFee + pa.duty + pa.wireFee + extraTotal;
  const totalCost = productTotalKrw + logisticTotal;
  const profit = pa.saleAmount - totalCost;
  const profitRate = pa.saleAmount > 0 ? (profit / pa.saleAmount) * 100 : 0;
  const effectivePayment = pa.paymentAmount > 0 ? pa.paymentAmount : productTotalKrw;
  const actualPayment = effectivePayment - pa.advancePayment;

  const costDetails = [
    { label: '포워더운임', val: pa.freightCost },
    { label: '내륙운송료', val: pa.inlandFreight },
    { label: '통관수수료', val: pa.brokerFee },
    { label: '관세', val: pa.duty },
    { label: '해외송금수수료', val: pa.wireFee },
    ...pa.extraCosts.filter(c => c.amount > 0).map(c => ({ label: c.name, val: c.amount })),
  ];

  return renderToBuffer(ProfitAnalysisDoc({
    businessId: row.business_id as string,
    title: pa.title,
    analysisDate: pa.analysisDate,
    customerName: pa.customerName,
    supplierName: pa.supplierName,
    importBusinessId: pa.importBusinessId,
    saleAmount: pa.saleAmount,
    customsExRate: cex,
    wireExRate: wex,
    productItems, productTotalKrw, productTotalRmb,
    logisticTotal, costDetails,
    vatImport: pa.vatImport,
    profit, profitRate, totalCost,
    advancePayment: pa.advancePayment,
    effectivePayment,
    paymentIsFromProductCost: pa.paymentAmount === 0 && productTotalKrw > 0,
    actualPayment,
  }));
}

export async function generateOfficialDocumentPdf(docId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM documents WHERE id=? AND doc_type='official'").get(docId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const data = JSON.parse((row.data_json as string) || '{}') as {
    recipient?: string; recipientAddress?: string; sender?: string; issueDate?: string; contentHtml?: string; contact?: string;
  };
  const company = getCompanySettings();

  return renderToBuffer(OfficialDocumentDoc({
    businessId: row.business_id as string,
    title: row.title as string,
    issueDate: data.issueDate || '',
    recipient: data.recipient || '',
    recipientAddress: data.recipientAddress,
    sender: data.sender || company.name,
    contentHtml: data.contentHtml || '',
    contact: data.contact,
    company,
    companyLogoPath: resolveCompanyAssetPath(company.logoUrl),
    stampPath: resolveCompanyAssetPath(company.stampUrl),
  }));
}

export async function generateImportCostSettlementPdf(docId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM documents WHERE id=? AND doc_type='import_cost_settlement'").get(docId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const data = JSON.parse((row.data_json as string) || '{}') as {
    customerName: string; customerCeo: string; productName: string; deliveryLocation: string;
    paymentCondition: string; paymentMethod: string;
    items: { name: string; qty: number; unitPriceCny: number }[];
    advance: { currency?: 'KRW' | 'USD' | 'CNY'; amount?: number; amountCny?: number; exchangeRate: number; note: string };
    balance: { currency?: 'KRW' | 'USD' | 'CNY'; amount?: number; amountCny?: number; exchangeRate: number; note: string };
  };
  const company = getCompanySettings();
  // 이전 버전 문서(통화 필드 없이 CNY 고정)와도 호환
  const normalizeSide = (s: typeof data.advance) => ({
    currency: s.currency || 'CNY',
    amount: s.amount ?? s.amountCny ?? 0,
    exchangeRate: s.exchangeRate,
    note: s.note,
  });

  return renderToBuffer(ImportCostSettlementDoc({
    businessId: row.business_id as string,
    issueDate: (row.created_at as string)?.slice(0, 10) || '',
    customerName: data.customerName, customerCeo: data.customerCeo, productName: data.productName,
    deliveryLocation: data.deliveryLocation, paymentCondition: data.paymentCondition, paymentMethod: data.paymentMethod,
    items: data.items || [], advance: normalizeSide(data.advance), balance: normalizeSide(data.balance),
    company,
    companyLogoPath: resolveCompanyAssetPath(company.logoUrl),
    stampPath: resolveCompanyAssetPath(company.stampUrl),
  }));
}

export async function generateTradeStatementCustomPdf(saleId: string): Promise<Buffer | null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE doc_type='trade_statement_custom' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(saleId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const data = JSON.parse((row.data_json as string) || '{}') as {
    docNo: string; issueDate: string;
    supplier: { bizNo: string; name: string; ceo: string; address: string; bizType: string; bizItem: string };
    customer: { bizNo: string; name: string; ceo: string; address: string; bizType: string; bizItem: string };
    items: TradeStatementItem[];
  };
  const items = data.items || [];
  const { supplyAmount, vatAmount, totalAmount } = calcTradeStatementTotals(items);

  const company = getCompanySettings();

  return renderToBuffer(TradeStatementCustomDoc({
    docNo: data.docNo, issueDate: data.issueDate,
    supplier: data.supplier, customer: data.customer,
    items: items.map(i => ({ productName: i.productName, specification: i.specification, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, amount: i.qty * i.unitPrice, remark: i.remark })),
    supplyAmount, vatAmount, totalAmount,
    stampPath: resolveCompanyAssetPath(company.stampUrl),
  }));
}
