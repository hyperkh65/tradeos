'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Plus, Menu, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: number;
  created_by_name?: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const unreadCount = notifications.filter(n => n.is_read === 0).length;

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => n.is_read === 0).map(n => n.id);
    if (!unreadIds.length) return;
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    }).catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const handleNotifClick = async (notif: Notification) => {
    await markRead(notif.id);
    setOpen(false);
    if (notif.link) router.push(notif.link);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 relative"
        onClick={() => setOpen(p => !p)}
        aria-label="알림"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[14px] h-[14px] flex items-center justify-center bg-destructive text-white text-[9px] font-bold rounded-full px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-sm font-semibold">알림</span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-primary hover:underline"
                  >
                    모두 읽음
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Bell className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                  알림이 없습니다
                </div>
              ) : (
                notifications.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors',
                      notif.is_read === 0 && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {notif.is_read === 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                      <div className={cn('min-w-0 flex-1', notif.is_read === 1 && 'pl-3.5')}>
                        <p className="text-xs font-medium truncate leading-snug">{notif.title}</p>
                        {notif.body && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{notif.body}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(notif.created_at)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

        <NotificationBell />
      </div>
    </header>
  );
}
