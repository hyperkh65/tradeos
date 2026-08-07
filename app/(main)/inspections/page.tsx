import { AppHeader } from '@/components/layout/header';
import { DEMO_INSPECTIONS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const resultStyle = { PASS: 'bg-green-100 text-green-700', CONDITIONAL_PASS: 'bg-yellow-100 text-yellow-700', FAIL: 'bg-red-100 text-red-700', PENDING: 'bg-gray-100 text-gray-600' };
const resultLabel = { PASS: 'PASS', CONDITIONAL_PASS: '조건부 PASS', FAIL: 'FAIL', PENDING: '대기' };

export default function InspectionsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="검품" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="검품번호, 제품명 검색..." className="pl-8 h-9" />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto"><Plus className="w-4 h-4" /> 새 검품</Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">검품번호</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">발주번호</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">제품명</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">공급업체</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">검품일</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">샘플수</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">불량률</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">결과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_INSPECTIONS.map((qc) => (
                <tr key={qc.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-medium">{qc.businessId}</td>
                  <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{qc.poBusinessId}</td>
                  <td className="px-4 py-3 font-medium">{qc.productName}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{qc.supplierName}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{qc.inspectionDate}</td>
                  <td className="px-4 py-3 text-right text-sm">{qc.sampleQty.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {qc.defectRate !== undefined ? (
                      <span className={cn('font-medium', qc.defectRate > 5 ? 'text-red-600' : qc.defectRate > 2 ? 'text-yellow-600' : 'text-green-600')}>
                        {qc.defectRate}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', resultStyle[qc.result])}>
                      {resultLabel[qc.result]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {DEMO_INSPECTIONS.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 검품 내역이 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 새 검품</Button>
          </div>
        )}
      </div>
    </div>
  );
}
