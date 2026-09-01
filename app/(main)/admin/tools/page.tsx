'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, ShieldAlert, Clapperboard, Wrench, Power, Hammer } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface AdminTool {
  id: string; slug: string; name: string; description: string | null; icon: string | null;
  category: string | null; route: string; enabled: boolean; maintenanceMode: boolean; beta: boolean;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Clapperboard,
};

/** slug/category 별로 하드코딩된 분기 없이 registry 응답만으로 렌더링한다 —
 * 새 도구가 추가되면(admin_tools에 행 하나) 이 화면은 코드 변경 없이 자동 반영. */
export default function AdminToolsPage() {
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [tools, setTools] = useState<AdminTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user ?? null));
  }, []);

  const loadTools = useCallback(() => {
    fetch('/api/admin-tools').then(r => r.json()).then(j => {
      setTools(Array.isArray(j.tools) ? j.tools : []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (me === undefined) return;
    if (me?.role !== 'admin') { setLoading(false); return; }
    loadTools();
  }, [me, loadTools]);

  const toggleTool = async (slug: string, patch: { enabled?: boolean; maintenanceMode?: boolean }) => {
    setTogglingSlug(slug);
    try {
      const res = await fetch(`/api/admin-tools/${slug}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (res.ok) loadTools();
    } finally {
      setTogglingSlug(null);
    }
  };

  if (me === undefined || loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="관리자 도구" icon={<Wrench className="w-5 h-5" />} />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  if (me?.role !== 'admin') {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="관리자 도구" icon={<Wrench className="w-5 h-5" />} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <ShieldAlert className="w-10 h-10" />
          <p className="text-sm">관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  const byCategory = new Map<string, AdminTool[]>();
  for (const t of tools) {
    const cat = t.category || '기타';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(t);
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="관리자 도구" icon={<Wrench className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        {tools.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">등록된 도구가 없습니다.</p>
        ) : (
          [...byCategory.entries()].map(([category, items]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(tool => {
                  const Icon = (tool.icon && ICONS[tool.icon]) || Wrench;
                  const disabled = !tool.enabled || tool.maintenanceMode;
                  const card = (
                    <div className={cn('bg-card border rounded-xl p-4 flex flex-col gap-2 h-full transition-colors',
                      disabled ? 'opacity-60' : 'hover:border-primary/50')}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-primary shrink-0" />
                        <span className="font-semibold text-sm">{tool.name}</span>
                        {tool.beta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">BETA</span>}
                      </div>
                      <p className="text-xs text-muted-foreground flex-1">{tool.description}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={cn('text-[11px] font-medium',
                          !tool.enabled ? 'text-red-500' : tool.maintenanceMode ? 'text-amber-600' : 'text-green-600')}>
                          {!tool.enabled ? '비활성화' : tool.maintenanceMode ? '점검 중' : '정상'}
                        </span>
                        {!disabled && <span className="text-xs text-primary font-medium">열기 →</span>}
                      </div>
                      <div className="flex items-center gap-1.5 pt-2 border-t" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                        <button
                          onClick={() => toggleTool(tool.slug, { enabled: !tool.enabled })}
                          disabled={togglingSlug === tool.slug}
                          className="h-7 px-2 rounded-md border border-input text-[11px] font-medium hover:bg-muted/50 flex items-center gap-1 disabled:opacity-50">
                          <Power className="w-3 h-3" />{tool.enabled ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() => toggleTool(tool.slug, { maintenanceMode: !tool.maintenanceMode })}
                          disabled={togglingSlug === tool.slug || !tool.enabled}
                          className="h-7 px-2 rounded-md border border-input text-[11px] font-medium hover:bg-muted/50 flex items-center gap-1 disabled:opacity-50">
                          <Hammer className="w-3 h-3" />{tool.maintenanceMode ? '점검 해제' : '점검 설정'}
                        </button>
                      </div>
                    </div>
                  );
                  return disabled
                    ? <div key={tool.id}>{card}</div>
                    : <Link key={tool.id} href={tool.route}>{card}</Link>;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
