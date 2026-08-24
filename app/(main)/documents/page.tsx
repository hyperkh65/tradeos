'use client';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/header';
import { DOCUMENT_TEMPLATES } from '@/lib/document-templates';
import { FileText, Table2, ChevronRight } from 'lucide-react';

const ICONS: Record<string, typeof FileText> = {
  richtext: FileText,
  structured: Table2,
};

export default function DocumentsHubPage() {
  return (
    <div className="flex flex-col h-full">
      <AppHeader title="문서양식" />
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground mb-5">양식을 선택하면 작성된 문서 목록과 새 문서 작성 화면으로 이동합니다.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOCUMENT_TEMPLATES.map(t => {
            const Icon = ICONS[t.kind];
            return (
              <Link key={t.id} href={t.href}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
