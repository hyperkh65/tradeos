import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'balance-sheet';
  const from = searchParams.get('from') || `${new Date().getFullYear()}-01-01`;
  const to = searchParams.get('to') || new Date().toISOString().slice(0,10);
  const accountCode = searchParams.get('account');
  const db = getDb();

  if (type === 'ledger') {
    let q = `SELECT jl.*, je.entry_date, je.entry_no, je.description, je.status
      FROM journal_lines jl JOIN journal_entries je ON jl.entry_id=je.id
      WHERE je.status='posted' AND je.entry_date BETWEEN ? AND ?`;
    const p: unknown[] = [from, to];
    if (accountCode) { q += ' AND jl.account_code=?'; p.push(accountCode); }
    q += ' ORDER BY je.entry_date, je.entry_no, jl.line_no';
    const rows = db.prepare(q).all(...p);
    return NextResponse.json({ data: rows });
  }

  const rows = db.prepare(`
    SELECT jl.account_code, jl.account_name,
           ca.type, ca.normal_balance, ca.group_name,
           SUM(jl.debit) as total_debit,
           SUM(jl.credit) as total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON jl.entry_id=je.id
    LEFT JOIN chart_of_accounts ca ON jl.account_code=ca.code
    WHERE je.status='posted' AND je.entry_date BETWEEN ? AND ?
    GROUP BY jl.account_code, jl.account_name
    ORDER BY jl.account_code
  `).all(from, to) as Array<{account_code:string;account_name:string;type:string;normal_balance:string;group_name:string;total_debit:number;total_credit:number}>;

  const accounts = rows.map(r => {
    const balance = r.normal_balance === 'debit'
      ? (r.total_debit||0) - (r.total_credit||0)
      : (r.total_credit||0) - (r.total_debit||0);
    return { ...r, balance };
  });

  if (type === 'balance-sheet') {
    const assets = accounts.filter(a => a.type==='asset');
    const liabilities = accounts.filter(a => a.type==='liability');
    const equity = accounts.filter(a => a.type==='equity');
    const revenue = accounts.filter(a => a.type==='revenue').reduce((s,a) => s+a.balance, 0);
    const expense = accounts.filter(a => a.type==='expense').reduce((s,a) => s+a.balance, 0);
    const netIncome = revenue - expense;
    return NextResponse.json({
      data: {
        assets, liabilities, equity,
        totalAssets: assets.reduce((s,a) => s+a.balance, 0),
        totalLiabilities: liabilities.reduce((s,a) => s+a.balance, 0),
        totalEquity: equity.reduce((s,a) => s+a.balance, 0) + netIncome,
        netIncome, period: { from, to },
      }
    });
  }

  if (type === 'income') {
    const revenue = accounts.filter(a => a.type==='revenue');
    const expense = accounts.filter(a => a.type==='expense');
    const totalRevenue = revenue.reduce((s,a) => s+a.balance, 0);
    const totalExpense = expense.reduce((s,a) => s+a.balance, 0);
    const cogs = expense.filter(a => a.group_name==='매출원가');
    const opex = expense.filter(a => ['판매관리비','수입원가'].includes(a.group_name||''));
    const nonOp = expense.filter(a => a.group_name==='영업외비용');
    const nonOpRev = revenue.filter(a => a.group_name==='영업외수익');
    return NextResponse.json({
      data: {
        revenue, expense, cogs, opex, nonOp, nonOpRev,
        totalRevenue, totalExpense,
        grossProfit: totalRevenue - cogs.reduce((s,a) => s+a.balance, 0),
        operatingIncome: totalRevenue - cogs.reduce((s,a) => s+a.balance, 0) - opex.reduce((s,a) => s+a.balance, 0),
        netIncome: totalRevenue - totalExpense,
        period: { from, to },
      }
    });
  }

  return NextResponse.json({ data: accounts });
}
