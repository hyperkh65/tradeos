'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, Clapperboard, Plus, Search, ExternalLink, Video, Layout as LayoutIcon, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ProjectRow {
  id: string; businessId: string; expression: string; status: string; templateId: string | null;
  createdByName: string | null; createdAt: string; updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '초안', source_required: '소스 필요', ready: '렌더링 준비', rendering: '렌더링중',
  completed: '완료', failed: '실패', archived: '보관',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', source_required: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700', rendering: 'bg-blue-100 text-blue-700 animate-pulse',
  completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-600', archived: 'bg-muted text-muted-foreground',
};

/** GetYarn 등 외부 사이트는 검색 URL만 구성해 시스템 기본 브라우저 새 탭으로 연다
 * (요청서 13/69번) — 서버사이드 스크래핑/자동다운로드는 하지 않는다. */
function buildGetYarnSearchUrl(expression: string): string {
  return `https://getyarn.it/find-yarn?text=${encodeURIComponent(expression)}`;
}

export default function EnglishShortsHomePage() {
  const router = useRouter();
  const [expression, setExpression] = useState('');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<{ existingProjects: ProjectRow[] } | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin-tools/english-shorts/projects').then(r => r.json()).then(j => {
      setProjects(Array.isArray(j.projects) ? j.projects : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createProject = async (force = false) => {
    if (!expression.trim()) return;
    setCreating(true);
    setErrorMsg(null);
    setDupWarning(null);
    try {
      const res = await fetch('/api/admin-tools/english-shorts/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression, force }),
      });
      const j = await res.json();
      if (res.status === 409) { setDupWarning({ existingProjects: j.existingProjects || [] }); return; }
      if (!res.ok) { setErrorMsg(j.error || '생성 실패'); return; }
      setExpression('');
      load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="영어 표현 쇼츠 제작기" icon={<Clapperboard className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-1.5">
            <Link href="/admin/tools/english-shorts/library" className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
              <Video className="w-4 h-4" />소스 라이브러리
            </Link>
            <Link href="/admin/tools/english-shorts/templates" className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
              <LayoutIcon className="w-4 h-4" />템플릿
            </Link>
            <Link href="/admin/tools/english-shorts/settings" className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
              <Settings className="w-4 h-4" />설정
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground block">영어 표현</label>
          <div className="flex flex-wrap gap-2">
            <input
              value={expression}
              onChange={e => setExpression(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createProject(); } }}
              placeholder="예: I could have sworn"
              className="flex-1 min-w-[240px] h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button onClick={() => createProject()} disabled={creating || !expression.trim()}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              새 프로젝트
            </button>
            {expression.trim() && (
              <a href={buildGetYarnSearchUrl(expression)} target="_blank" rel="noopener noreferrer"
                className="h-10 px-4 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
                <Search className="w-4 h-4" />GetYarn에서 검색<ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
          {dupWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-2">
              <p className="text-amber-800 font-medium">이 표현으로 만든 프로젝트가 있습니다.</p>
              <div className="flex flex-wrap gap-2">
                {dupWarning.existingProjects.map(p => (
                  <span key={p.id} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">{p.businessId}</span>
                ))}
              </div>
              <button onClick={() => createProject(true)} className="text-primary underline">그래도 새로 만들기</button>
            </div>
          )}
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">아직 만든 프로젝트가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">표현</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">상태</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">생성자</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">생성일</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => router.push(`/admin/tools/english-shorts/${p.id}`)}>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.businessId}</td>
                    <td className="px-3 py-2 font-medium">{p.expression}</td>
                    <td className="px-3 py-2"><span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_COLOR[p.status])}>{STATUS_LABEL[p.status] || p.status}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{p.createdByName || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
