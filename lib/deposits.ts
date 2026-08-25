export interface DepositFile {
  url: string; filename: string; originalName: string; size: number;
}
export interface DepositEntry {
  id: string;
  date: string;
  amount: number;
  accountId?: string;
  memo?: string;
  files: DepositFile[];
}

export type DepositStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';

export function summarizeDeposits(totalDue: number, deposits: DepositEntry[]) {
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const remaining = Math.round((totalDue - totalDeposited) * 100) / 100;
  let status: DepositStatus = 'unpaid';
  if (totalDeposited <= 0) status = 'unpaid';
  else if (remaining > 0) status = 'partial';
  else if (remaining === 0) status = 'paid';
  else status = 'overpaid';
  return { totalDeposited, remaining, status };
}

export function parseDeposits(json: string | null | undefined): DepositEntry[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
