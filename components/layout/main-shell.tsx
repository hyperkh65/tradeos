'use client';

import { useState, useEffect } from 'react';
import { SidebarContext } from '@/lib/sidebar-context';
import { AppSidebar } from './sidebar';
import { cn } from '@/lib/utils';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { FloatingAssistant } from '@/components/ai/floating-assistant';

export function MainShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) setCollapsed(JSON.parse(saved));
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  };

  return (
    <SidebarContext.Provider
      value={{ toggle: () => setOpen(p => !p), close: () => setOpen(false), collapsed, toggleCollapsed }}
    >
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className={cn(
          'hidden md:flex shrink-0 transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-14' : 'w-56'
        )}>
          <AppSidebar />
        </div>

        {/* Mobile overlay */}
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="w-64 max-w-[80vw] bg-sidebar overflow-y-auto shadow-2xl"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <AppSidebar onNavigate={() => setOpen(false)} />
            </div>
            <button
              className="flex-1 bg-black/40"
              onClick={() => setOpen(false)}
              aria-label="사이드바 닫기"
            />
          </div>
        )}

        <main
          className="flex-1 flex flex-col overflow-hidden min-w-0"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          {children}
        </main>
      </div>
      <NotificationToast />
      <FloatingAssistant />
    </SidebarContext.Provider>
  );
}
