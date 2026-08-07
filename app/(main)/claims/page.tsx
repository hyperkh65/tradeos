import { AppHeader } from '@/components/layout/header';
import { DEMO_CLAIMS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusStyle: Record<string, string> = { '접수': 'bg-gray-100 text-gray-600', '내부확인': 'bg-blue-100 text-blue-700', '업체전달': 'bg-yellow-100 text-yellow-700', '협상': 'bg-orange-100 text-orange-700', '합의': 'bg-purple-100 text-purple-700', '완료': 'bg-green-100 text-green-700' };
const issueColor: Record<string, string> = { '품질': 'bg-red-50 text-red-700', '수량': 'bg-orange-50 text-orange-700', '파손': 'bg-yellow-50 text-yellow-700', '지연': 'bg-blue-50 text-blue-700', '사양': 'bg-purple-50 text-purple-700', '기타': 'bg-gray-50 text-gray-600' };

export default function ClaimsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="클레임" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="클레임번호, 제품명 검색..." className="pl-8 h-9" />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto"><Plus className="w-4 h-4" /> 새 클레임</Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">클레임번호</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">유형</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">고객사</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">공급업체</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">제품</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">클레임금액</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">등록일</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_CLAIMS.map((clm) => (
                <tr key={clm.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-medium">{clm.businessId}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', issueColor[clm.issueType])}>
                      {clm.issueType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{clm.customerName ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{clm.supplierName ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{clm.productName ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {clm.claimAmount ? `${clm.currency} ${clm.claimAmount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{clm.createdAt.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[clm.status])}>
                      {clm.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {DEMO_CLAIMS.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 클레임이 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 새 클레임</Button>
          </div>
        )}
      </div>
    </div>
  );
}
