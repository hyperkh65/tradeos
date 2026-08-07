'use client';

import { AppHeader } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Boxes, Ship, AlertCircle, CheckSquare, FileText, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

const priorityColor = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
} as const;

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  production: 'bg-yellow-100 text-yellow-700',
  inspection: 'bg-purple-100 text-purple-700',
  shipped: 'bg-green-100 text-green-700',
  completed: 'bg-green-200 text-green-800',
  cancelled: 'bg-red-100 text-red-600',
};

interface Task {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: string;
  due_date?: string;
}

interface PurchaseOrder {
  id: string;
  business_id: string;
  supplier_name: string;
  status: string;
  total_amount: number;
  etd?: string;
}

interface Inspection {
  id: string;
  business_id: string;
  product_name: string;
  inspection_date: string;
  result: string;
  defect_rate?: number;
}

interface Shipment {
  id: string;
  business_id: string;
  pol?: string;
  pod?: string;
  type: string;
  etd?: string;
  eta?: string;
}

export default function HomePage() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const [userName, setUserName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState({ activePOs: 0, upcomingShipments: 0, pendingTasks: 0, pendingApprovals: 0, openClaims: 0 });

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setUserName(j.user.name); }).catch(() => {});

    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/inspections').then(r => r.json()),
      fetch('/api/shipments').then(r => r.json()),
      fetch('/api/approvals').then(r => r.json()),
      fetch('/api/claims').then(r => r.json()),
    ]).then(([taskData, poData, inspData, shpData, aprData, claimData]) => {
      const taskList: Task[] = Array.isArray(taskData) ? taskData : (taskData.data ?? []);
      const poList: PurchaseOrder[] = Array.isArray(poData) ? poData : (poData.data ?? []);
      const inspList: Inspection[] = Array.isArray(inspData) ? inspData : (inspData.data ?? []);
      const shpList: Shipment[] = Array.isArray(shpData) ? shpData : (shpData.data ?? []);
      const aprList = Array.isArray(aprData) ? aprData : (aprData.data ?? []);
      const claimList = Array.isArray(claimData) ? claimData : (claimData.data ?? []);

      setTasks(taskList);
      setPos(poList);
      setInspections(inspList.slice(0, 5));
      setShipments(shpList.slice(0, 5));
      setStats({
        activePOs: poList.filter((p: PurchaseOrder) => !['completed', 'cancelled'].includes(p.status)).length,
        upcomingShipments: shpList.filter((s: Shipment) => !['delivered', 'cancelled'].includes((s as unknown as Record<string,string>).status ?? '')).length,
        pendingTasks: taskList.filter((t: Task) => t.status !== '완료').length,
        pendingApprovals: aprList.filter((a: Record<string,string>) => a.status === '대기' || a.status === '진행중').length,
        openClaims: claimList.filter((c: Record<string,string>) => !['해결', '종결'].includes(c.status ?? '')).length,
      });
    }).catch(() => {});
  }, []);

  const todayTasks = tasks.filter(t => t.status !== '완료').slice(0, 5);
  const activePOs = pos.filter(p => !['completed', 'cancelled'].includes(p.status));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader />
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        <div>
          <h2 className="text-xl font-bold text-foreground">안녕하세요, {userName ? `${userName}님` : '...'} 👋</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {[
            { label: '진행 중 발주', value: stats.activePOs, icon: Boxes, href: '/purchase-orders', color: 'text-blue-600' },
            { label: '선적 예정', value: stats.upcomingShipments, icon: Ship, href: '/shipments', color: 'text-green-600' },
            { label: '미완료 업무', value: stats.pendingTasks, icon: CheckSquare, href: '/tasks', color: 'text-purple-600' },
            { label: '결재 대기', value: stats.pendingApprovals, icon: FileText, href: '/approvals', color: 'text-yellow-600' },
            { label: '진행 클레임', value: stats.openClaims, icon: AlertCircle, href: '/claims', color: 'text-red-600' },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className={cn('text-2xl font-bold mt-0.5', s.color)}>{s.value}</p>
                    </div>
                    <s.icon className={cn('w-5 h-5 mt-0.5', s.color)} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">오늘 확인할 업무</CardTitle>
                <Link href="/tasks" className="text-xs text-primary hover:underline">전체보기</Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {todayTasks.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">완료된 업무가 없거나 데이터가 없습니다.</p>
              )}
              {todayTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
                  <span className={cn('shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded', priorityColor[task.priority] ?? 'bg-gray-100 text-gray-600')}>
                    {task.priority === 'urgent' ? '긴급' : task.priority === 'high' ? '높음' : task.priority === 'medium' ? '보통' : '낮음'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {task.due_date}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{task.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">진행 중 발주</CardTitle>
                <Link href="/purchase-orders" className="text-xs text-primary hover:underline">전체보기</Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {activePOs.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">진행 중인 발주가 없습니다.</p>
              )}
              {activePOs.slice(0, 5).map((po) => (
                <div key={po.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-foreground">{po.business_id}</span>
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', statusColor[po.status] ?? 'bg-gray-100 text-gray-600')}>
                        {po.status === 'production' ? '생산' : po.status === 'inspection' ? '검품' : po.status === 'shipped' ? '선적' : po.status === 'confirmed' ? '확정' : po.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{po.supplier_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">${po.total_amount.toLocaleString()}</p>
                    {po.etd && <p className="text-xs text-muted-foreground">ETD {po.etd}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">최근 검품</CardTitle>
                <Link href="/inspections" className="text-xs text-primary hover:underline">전체보기</Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {inspections.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">검품 내역이 없습니다.</p>
              )}
              {inspections.map((qc) => (
                <div key={qc.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    qc.result === 'PASS' ? 'bg-green-100 text-green-700' :
                    qc.result === 'CONDITIONAL_PASS' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  )}>
                    {qc.result === 'PASS' ? 'OK' : qc.result === 'CONDITIONAL_PASS' ? '조건' : 'NG'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{qc.product_name}</p>
                    <p className="text-xs text-muted-foreground">{qc.business_id} · {qc.inspection_date}</p>
                  </div>
                  {qc.defect_rate != null && (
                    <span className="text-xs text-muted-foreground shrink-0">불량 {qc.defect_rate}%</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">선적 현황</CardTitle>
                <Link href="/shipments" className="text-xs text-primary hover:underline">전체보기</Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {shipments.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">예정된 선적이 없습니다.</p>
              )}
              {shipments.map((shp) => (
                <div key={shp.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Ship className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{shp.business_id}</p>
                    <p className="text-xs text-muted-foreground">{shp.pol} → {shp.pod} · {shp.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {shp.etd && <p className="text-xs">ETD {shp.etd}</p>}
                    {shp.eta && <p className="text-xs text-muted-foreground">ETA {shp.eta}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
