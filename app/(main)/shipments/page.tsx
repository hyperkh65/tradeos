import { AppHeader } from '@/components/layout/header';
import { DEMO_SHIPMENTS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ship, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusStyle: Record<string, string> = { booked: 'bg-blue-100 text-blue-700', departed: 'bg-cyan-100 text-cyan-700', in_transit: 'bg-purple-100 text-purple-700', arrived: 'bg-green-100 text-green-700', customs: 'bg-orange-100 text-orange-700', completed: 'bg-gray-100 text-gray-600' };
const statusLabel: Record<string, string> = { booked: '예약', departed: '출발', in_transit: '운송중', arrived: '도착', customs: '통관', completed: '완료' };

export default function ShipmentsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="선적" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="선적번호, B/L 검색..." className="pl-8 h-9" />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto"><Plus className="w-4 h-4" /> 새 선적</Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">선적번호</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">유형</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">구간</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">포워더</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">ETD</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">ETA</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">B/L</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEMO_SHIPMENTS.map((shp) => (
                <tr key={shp.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-medium">{shp.businessId}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{shp.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span>{shp.pol}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span>{shp.pod}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{shp.forwarderName ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{shp.etd ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{shp.eta ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shp.blNo ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[shp.status])}>
                      {statusLabel[shp.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {DEMO_SHIPMENTS.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Ship className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 선적이 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 새 선적</Button>
          </div>
        )}
      </div>
    </div>
  );
}
