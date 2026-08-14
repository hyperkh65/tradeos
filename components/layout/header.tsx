'use client';

import React from 'react';
import { Bell, Plus, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/lib/sidebar-context';

export function AppHeader({ title, icon, actions }: { title?: string; icon?: React.ReactNode; actions?: React.ReactNode }) {
  const router = useRouter();
  const { toggle } = useSidebar();

  return (
    <header className="h-12 border-b border-border flex items-center px-3 gap-2 bg-background shrink-0">
      {/* Hamburger — mobile only */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8 shrink-0"
        onClick={toggle}
        aria-label="메뉴"
      >
        <Menu className="w-4 h-4" />
      </Button>

      {title && <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>}

      <div className="ml-auto flex items-center gap-1">
        {actions && <div className="flex items-center gap-1 mr-1">{actions}</div>}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">새로 만들기</span>
            <span className="sm:hidden">추가</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push('/tasks?new=1')}>📋 새 업무</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/companies?new=1')}>🏢 새 거래처</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/products?new=1')}>📦 새 제품</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/quotes?new=1')}>📄 새 견적</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/purchase-orders?new=1')}>🛒 새 발주</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/inspections?new=1')}>🔍 새 검품</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/expenses?new=1')}>💰 새 비용</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/claims?new=1')}>⚠️ 새 클레임</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="h-7 w-7 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-destructive rounded-full" />
        </Button>
      </div>
    </header>
  );
}
