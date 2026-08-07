import { AppHeader } from '@/components/layout/header';
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Package, Plus, Search } from 'lucide-react';

export default function ProductsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="제품" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="제품명, 코드 검색..." className="pl-8 h-9" />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto">
            <Plus className="w-4 h-4" /> 제품 등록
          </Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">제품코드</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">제품명</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">공급업체</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">카테고리</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">매입단가</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">판매가</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">MOQ</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_PRODUCTS.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{p.businessId}</span>
                      <p className="font-medium text-xs mt-0.5">{p.code}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.nameKo}</p>
                    {p.nameEn && <p className="text-xs text-muted-foreground mt-0.5">{p.nameEn}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.supplierName}</td>
                  <td className="px-4 py-3">
                    {p.category && <Badge variant="secondary" className="text-xs">{p.category}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {p.purchasePrice ? `$${p.purchasePrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {p.sellingPrice ? `₩${p.sellingPrice.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {p.moq ? p.moq.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {p.status === 'active' ? '활성' : p.status === 'inactive' ? '비활성' : '샘플'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {DEMO_PRODUCTS.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 제품이 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 제품 등록</Button>
          </div>
        )}
      </div>
    </div>
  );
}
