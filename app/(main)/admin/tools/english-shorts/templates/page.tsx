'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, LayoutTemplate } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TemplateSettingsField {
  key: string; label: string; type: 'select' | 'number' | 'color' | 'boolean';
  options?: { value: string; label: string }[]; min?: number; max?: number; step?: number;
}
interface Template {
  id: string; slug: string; name: string; description: string | null;
  layout: { kind: string; defaults: Record<string, unknown>; settingsSchema: TemplateSettingsField[] };
  enabled: boolean; sortOrder: number;
}

/** 템플릿 카탈로그 — 설정값 기반 5종을 보여준다. 드래그앤드롭 타임라인 에디터는
 * 만들지 않는다(요청서 26번). 실제 선택/설정 조정은 프로젝트 에디터 화면에서 한다. */
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin-tools/english-shorts/templates').then(r => r.json()).then(j => {
      setTemplates(Array.isArray(j.templates) ? j.templates : []);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="템플릿" icon={<LayoutTemplate className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-card border rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold">{t.name}</h3>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <div className="pt-2 border-t space-y-1">
                  {t.layout.settingsSchema.map(f => (
                    <div key={f.key} className="text-xs text-muted-foreground flex justify-between">
                      <span>{f.label}</span>
                      <span className="font-mono">{String(t.layout.defaults[f.key] ?? '-')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
