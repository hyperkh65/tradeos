import { AppHeader } from '@/components/layout/header';
import { DEMO_PURCHASE_ORDERS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusLabel: Record<string, string> = { draft: '초안', confirmed: '확정', production: '생산', inspection: '검품', shipped: '선적', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', production: 'bg-yellow-100 text-yellow-700', inspection: 'bg-purple-100 text-purple-700', shipped: 'bg-cyan-100 text-cyan-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };

export default function PurchaseOrdersPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="발주" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="발주번호, 업체명 검색..." className="pl-8 h-9" />
          </div>
          <div className="flex gap-1.5">
            {['전체', '생산', '검품', '선적'].map((s) => (
              <Button key={s} variant={s === '전체' ? 'default' : 'outline'} size="sm" className="h-9 text-xs">{s}</Button>
            ))}
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto"><Plus className="w-4 h-4" /> 새 발주</Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">발주번호</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">공급업체</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">품목</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">금액</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">발주일</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">ETD</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_PURCHASE_ORDERS.map((po) => (
                <tr key={po.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-medium">{po.businessId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{po.supplierName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{po.incoterm}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {po.items.map(i => i.productName).join(', ')}
                    <span className="ml-1 text-xs">({po.items.reduce((s, i) => s + i.qty, 0).toLocaleString()}개)</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold">{po.currency} {po.totalAmount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">잔금 {po.currency} {(po.balanceAmount ?? 0).toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{po.orderDate}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{po.etd ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusColor[po.status])}>
                      {statusLabel[po.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {DEMO_PURCHASE_ORDERS.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 발주가 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 새 발주</Button>
          </div>
        )}
      </div>
    </div>
  );
}
