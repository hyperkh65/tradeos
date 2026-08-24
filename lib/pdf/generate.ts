import { renderToBuffer } from '@react-pdf/renderer';
import { getDb } from '@/lib/db/sqlite';
import { getCompanySettings, resolveCompanyAssetPath } from './company';
import { SalesStatementDoc, type SaleItem } from './sales-statement';
import { PurchaseOrderDoc, type POItem } from './purchase-order';
import { ProfitAnalysisDoc } from './profit-analysis';

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
    productItems: (() => { try { return JSON.parse((row.product_items_json as string) || '[]'); } catch { return []; } })() as { qty: number; unitPriceFx: number; totalKrwManual?: number }[],
    extraCosts: (() => { try { return JSON.parse((row.extra_costs_json as string) || '[]'); } catch { return []; } })() as { name: string; amount: number }[],
  };

  const cex = pa.customsExRate || 1;
  const wex = pa.wireExRate || cex;
  let productTotal2 = 0;
  for (const item of pa.productItems) {
    productTotal2 += item.totalKrwManual ? item.totalKrwManual : Math.round((item.qty || 0) * (item.unitPriceFx || 0) * wex);
  }
  const extraTotal = pa.extraCosts.reduce((s, c) => s + (c.amount || 0), 0);
  const logisticTotal = pa.freightCost + pa.inlandFreight + pa.brokerFee + pa.duty + pa.wireFee + extraTotal;
  const totalCost = productTotal2 + logisticTotal;
  const profit = pa.saleAmount - totalCost;
  const profitRate = pa.saleAmount > 0 ? (profit / pa.saleAmount) * 100 : 0;

  const costRows = [
    { label: '제품원가 (②송금환율 기준)', tag: 'B-1', val: productTotal2 },
    { label: '포워더 운임 (해상+부대비용)', tag: 'B-2', val: pa.freightCost },
    { label: '내륙운송료', tag: 'B-3', val: pa.inlandFreight },
    { label: '통관수수료', tag: 'B-4', val: pa.brokerFee },
    { label: '관세', tag: 'B-5', val: pa.duty },
    { label: '기타비용', tag: 'B-6', val: extraTotal },
    { label: '해외송금수수료', tag: 'B-7', val: pa.wireFee },
  ].filter(r => r.val > 0);

  return renderToBuffer(ProfitAnalysisDoc({
    businessId: row.business_id as string,
    title: pa.title,
    analysisDate: pa.analysisDate,
    customerName: pa.customerName,
    supplierName: pa.supplierName,
    importBusinessId: pa.importBusinessId,
    saleAmount: pa.saleAmount,
    costRows, totalCost, profit, profitRate,
    vatImport: pa.vatImport,
  }));
}
