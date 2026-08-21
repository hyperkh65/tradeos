'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/lib/sidebar-context';
import {
  LayoutDashboard, Building2, Package, ClipboardList, FileText,
  MessageSquare, Mail, Calendar, CheckSquare, Ship, TruckIcon,
  AlertCircle, DollarSign, FolderOpen, Users, Settings, ChevronDown,
  Search, LogOut, Boxes, BarChart3, Warehouse, ShoppingCart,
  Receipt, UserCog, GitMerge, PanelLeftClose, PanelLeft, FileSignature, Calculator, TrendingUp,
} from 'lucide-react';

// Coros 로고마크 — 파란 둥근사각형 + 흰색 굵은 C + 중심 dot
function CorosLogoMark({ size = 16 }: { size?: number }) {
  const s = size;
  // C 호: 중심 (s/2, s/2), 반지름 s*0.32, 두께 s*0.165
  // 오른쪽이 열린 C (약 300°)
  const cx = s / 2, cy = s / 2, r = s * 0.32;
  // path: 오른쪽 위 → 왼쪽 반원 → 오른쪽 아래
  const gap = 50; // degrees (opening angle, both sides)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const startAngle = toRad(gap / 2);      // top-right
  const endAngle   = toRad(360 - gap / 2); // bottom-right
  const x1 = cx + r * Math.cos(startAngle - Math.PI / 2);
  const y1 = cy + r * Math.sin(startAngle - Math.PI / 2);
  const x2 = cx + r * Math.cos(endAngle - Math.PI / 2);
  const y2 = cy + r * Math.sin(endAngle - Math.PI / 2);
  const sw = s * 0.165; // stroke width
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} fill="none">
      {/* C arc */}
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 1 0 ${x2} ${y2}`}
        stroke="white"
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={s * 0.085} fill="white" />
    </svg>
  );
}
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const navGroups = [
  {
    label: '협업',
    items: [
      { label: '홈', href: '/', icon: LayoutDashboard },
      { label: '메신저', href: '/messenger', icon: MessageSquare, badgeKey: 'messenger' },
      { label: '메일', href: '/mail', icon: Mail, badgeKey: 'mail' },
      { label: '내 업무', href: '/tasks', icon: CheckSquare },
      { label: '일정', href: '/calendar', icon: Calendar },
      { label: '결재', href: '/approvals', icon: FileText, badgeKey: 'approvals' },
    ],
  },
  {
    label: '무역',
    items: [
      { label: '거래처', href: '/companies', icon: Building2 },
      { label: '제품', href: '/products', icon: Package },
      { label: '재고', href: '/inventory', icon: Warehouse },
      { label: '견적', href: '/quotes', icon: ClipboardList },
      { label: '발주', href: '/purchase-orders', icon: Boxes },
      { label: '계약', href: '/contracts', icon: FileSignature },
      { label: '검품', href: '/inspections', icon: CheckSquare },
      { label: '선적', href: '/shipments', icon: Ship },
      { label: '수입통관', href: '/imports', icon: TruckIcon },
      { label: '클레임', href: '/claims', icon: AlertCircle },
    ],
  },
  {
    label: '영업',
    items: [
      { label: '매출관리', href: '/crm', icon: ShoppingCart },
      { label: '비용 원장', href: '/costs', icon: DollarSign },
      { label: '원가계산기', href: '/estimator', icon: Calculator },
      { label: '수익분석', href: '/profit-analysis', icon: TrendingUp },
      { label: '회계/청구', href: '/accounting', icon: Receipt },
    ],
  },
  {
    label: '재무',
    items: [
      { label: '비용', href: '/expenses', icon: DollarSign },
      { label: 'SCM', href: '/scm', icon: GitMerge },
    ],
  },
  {
    label: '문서',
    items: [
      { label: '파일', href: '/files', icon: FolderOpen },
    ],
  },
  {
    label: '회사',
    items: [
      { label: '인사(HR)', href: '/hr', icon: UserCog },
      { label: '직원', href: '/employees', icon: Users },
    ],
  },
];

const allItems = navGroups.flatMap(g => g.items);

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { close, collapsed, toggleCollapsed } = useSidebar();
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [counts, setCounts] = useState<{ approvals: number; mail: number; messenger: number }>({ approvals: 0, mail: 0, messenger: 0 });

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setMe(j.user); }).catch(() => {});
    const fetchCounts = () => {
      fetch('/api/notifications/counts').then(r => r.json()).then(d => {
        if (d && typeof d === 'object') setCounts({ approvals: d.approvals ?? 0, mail: d.mail ?? 0, messenger: d.messenger ?? 0 });
      }).catch(() => {});
    };
    fetchCounts();
    const timer = setInterval(fetchCounts, 30000);
    return () => clearInterval(timer);
  }, []);

  const toggleGroup = (label: string) => {
    setGroupCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const handleNav = (href: string) => {
    router.push(href);
    close();
    onNavigate?.();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    close();
  };

  /* ── COLLAPSED (icon-only) mode ─────────────────────────────── */
  if (collapsed) {
    return (
      <aside className="flex flex-col h-full w-full border-r border-border bg-sidebar shrink-0">
        {/* Logo icon */}
        <div className="h-12 flex items-center justify-center border-b border-sidebar-border shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shadow-sm">
            <CorosLogoMark size={16} />
          </div>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {allItems.map(item => {
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                title={item.label}
                className={cn(
                  'w-full flex items-center justify-center py-2 rounded-md transition-colors relative',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.badgeKey && (counts[item.badgeKey as keyof typeof counts] > 0) && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-destructive rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom icons */}
        <div className="shrink-0 border-t border-sidebar-border py-2 px-1.5 space-y-0.5">
          <button onClick={() => handleNav('/admin')} title="사용자 관리" className="w-full flex items-center justify-center py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <Users className="w-4 h-4" />
          </button>
          <button onClick={() => handleNav('/settings')} title="설정" className="w-full flex items-center justify-center py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={toggleCollapsed} title="사이드바 펼치기" className="w-full flex items-center justify-center py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  /* ── EXPANDED mode ───────────────────────────────────────────── */
  return (
    <aside className="flex flex-col h-full w-full border-r border-border bg-sidebar shrink-0">
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-sidebar-border shrink-0">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shadow-sm">
          <CorosLogoMark size={16} />
        </div>
        <span className="font-bold text-sidebar-foreground tracking-tight text-sm">Coros</span>
        <button
          onClick={toggleCollapsed}
          title="사이드바 접기"
          className="ml-auto text-muted-foreground hover:text-sidebar-foreground transition-colors"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-sidebar-border shrink-0">
        <button className="w-full flex items-center gap-2 text-xs text-muted-foreground bg-sidebar-accent rounded-md px-2.5 py-1.5 hover:bg-sidebar-accent/80 transition-colors">
          <Search className="w-3.5 h-3.5" />
          <span>검색</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-sidebar-foreground transition-colors"
            >
              {group.label}
              <ChevronDown
                className={cn('w-3 h-3 transition-transform', groupCollapsed[group.label] && '-rotate-90')}
              />
            </button>

            {!groupCollapsed[group.label] && (
              <div className="space-y-0.5 mt-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleNav(item.href)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <item.icon className={cn('w-4 h-4 shrink-0', active ? 'text-sidebar-primary-foreground' : 'text-muted-foreground')} />
                      <span className="truncate">{item.label}</span>
                      {item.badgeKey && (counts[item.badgeKey as keyof typeof counts] > 0) && (
                        <Badge
                          variant={active ? 'outline' : 'secondary'}
                          className="ml-auto text-[10px] h-4 px-1 py-0 min-w-[16px] flex items-center justify-center"
                        >
                          {counts[item.badgeKey as keyof typeof counts]}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="shrink-0 border-t border-sidebar-border p-2 space-y-0.5">
        <button
          onClick={() => handleNav('/admin')}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Users className="w-4 h-4 text-muted-foreground" />
          사용자 관리
        </button>
        <button
          onClick={() => handleNav('/settings')}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          설정
        </button>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
            {me?.name?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{me?.name ?? '...'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{me?.role === 'admin' ? '관리자' : me?.role ?? ''}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
            onClick={handleLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
