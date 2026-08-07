'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/lib/sidebar-context';
import {
  LayoutDashboard, Building2, Package, ClipboardList, FileText,
  MessageSquare, Mail, Calendar, CheckSquare, Ship, TruckIcon,
  AlertCircle, DollarSign, FolderOpen, Users, Settings, ChevronDown,
  Compass, Search, LogOut, Boxes,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const navGroups = [
  {
    label: '협업',
    items: [
      { label: '홈', href: '/', icon: LayoutDashboard },
      { label: '메신저', href: '/messenger', icon: MessageSquare, badge: '3' },
      { label: '메일', href: '/mail', icon: Mail, badge: '5' },
      { label: '내 업무', href: '/tasks', icon: CheckSquare },
      { label: '일정', href: '/calendar', icon: Calendar },
      { label: '결재', href: '/approvals', icon: FileText, badge: '1' },
    ],
  },
  {
    label: '무역',
    items: [
      { label: '거래처', href: '/companies', icon: Building2 },
      { label: '제품', href: '/products', icon: Package },
      { label: '견적', href: '/quotes', icon: ClipboardList },
      { label: '발주', href: '/purchase-orders', icon: Boxes },
      { label: '검품', href: '/inspections', icon: CheckSquare },
      { label: '선적', href: '/shipments', icon: Ship },
      { label: '수입통관', href: '/imports', icon: TruckIcon },
      { label: '클레임', href: '/claims', icon: AlertCircle },
    ],
  },
  {
    label: '재무',
    items: [
      { label: '비용', href: '/expenses', icon: DollarSign },
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
      { label: '직원', href: '/employees', icon: Users },
    ],
  },
];

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { close } = useSidebar();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
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

  return (
    <aside className="flex flex-col h-full w-56 border-r border-border bg-sidebar shrink-0">
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-sidebar-border shrink-0">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shadow-sm">
          <Compass className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-sidebar-foreground tracking-tight text-sm">NEXPORT</span>
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
                className={cn('w-3 h-3 transition-transform', collapsed[group.label] && '-rotate-90')}
              />
            </button>

            {!collapsed[group.label] && (
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
                      {item.badge && (
                        <Badge
                          variant={active ? 'outline' : 'secondary'}
                          className="ml-auto text-[10px] h-4 px-1 py-0 min-w-[16px] flex items-center justify-center"
                        >
                          {item.badge}
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
            김
          </div>
          <span className="text-xs text-sidebar-foreground truncate flex-1">김대표</span>
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
