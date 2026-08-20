'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: number;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

interface ToastItem extends Notification {
  toastId: string;
  removing?: boolean;
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

export function NotificationToast() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
    const timer = timers.current.get(toastId);
    if (timer) { clearTimeout(timer); timers.current.delete(toastId); }
  }, []);

  const markRead = useCallback(async (notifId: string) => {
    await fetch(`/api/notifications/${notifId}`, { method: 'PATCH' }).catch(() => {});
  }, []);

  const handleClick = useCallback(async (toast: ToastItem) => {
    removeToast(toast.toastId);
    await markRead(toast.id);
    if (toast.link) router.push(toast.link);
  }, [removeToast, markRead, router]);

  const addToast = useCallback((notif: Notification) => {
    if (seenIds.current.has(notif.id)) return;
    seenIds.current.add(notif.id);

    const toastId = notif.id + '_' + Date.now();
    const toastItem: ToastItem = { ...notif, toastId };

    setToasts(prev => {
      const updated = [toastItem, ...prev].slice(0, 3);
      return updated;
    });

    const timer = setTimeout(() => {
      removeToast(toastId);
    }, 5000);
    timers.current.set(toastId, timer);
  }, [removeToast]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const json = await res.json();
      const notifs: Notification[] = json.data || [];
      const unread = notifs.filter(n => n.is_read === 0);
      for (const n of unread) {
        addToast(n);
      }
    } catch { /* ignore */ }
  }, [addToast]);

  useEffect(() => {
    // Initial poll after short delay
    const initial = setTimeout(poll, 2000);
    const interval = setInterval(poll, 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      timers.current.forEach(t => clearTimeout(t));
    };
  }, [poll]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.toastId}
          className={cn(
            'pointer-events-auto w-80 bg-white rounded-xl shadow-xl border border-gray-200',
            'animate-in slide-in-from-bottom-5 fade-in duration-300'
          )}
        >
          <div className="flex items-start gap-3 p-3.5">
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="w-4 h-4 text-primary" />
              </div>
            </div>
            <button
              className="flex-1 text-left min-w-0"
              onClick={() => handleClick(toast)}
            >
              <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{toast.title}</p>
              {toast.body && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{toast.body}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">{timeAgo(toast.created_at)}</p>
            </button>
            <button
              className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors mt-0.5"
              onClick={() => { removeToast(toast.toastId); markRead(toast.id); }}
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
