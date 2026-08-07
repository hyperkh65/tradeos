import { AppHeader } from '@/components/layout/header';
import { DEMO_EXPENSES } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusStyle: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
const statusLabel: Record<string, string> = { pending: '대기', approved: '승인', paid: '지급완료' };

export default function ExpensesPage() {
  const total = DEMO_EXPENSES.reduce((s, e) => s + (e.amountKrw ?? e.amount), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="비용" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="비용 설명, 카테고리 검색..." className="pl-8 h-9" />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto"><Plus className="w-4 h-4" /> 비용 등록</Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">카테고리</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">내용</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">연결 건</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">금액</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">원화환산</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">지급일</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_EXPENSES.map((exp) => (
                <tr key={exp.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">{exp.category}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{exp.description}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{exp.relatedName ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {exp.currency === 'KRW' ? `₩${exp.amount.toLocaleString()}` : `${exp.currency} ${exp.amount.toLocaleString()}`}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {exp.amountKrw ? `₩${exp.amountKrw.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{exp.paidDate ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[exp.status])}>
                      {statusLabel[exp.status]}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-4 py-3 text-sm" colSpan={4}>합계</td>
                <td className="px-4 py-3 text-right text-sm">₩{total.toLocaleString()}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
