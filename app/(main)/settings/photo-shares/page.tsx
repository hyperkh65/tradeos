'use client';

import { AppHeader } from '@/components/layout/header';
import { useState, useEffect, useCallback } from 'react';
import { Link2, Copy, Check, Trash2, Loader2, Eye, Download, Lock, AlertTriangle } from 'lucide-react';

interface ShareRow {
  id: string; targetType: string; targetId: string | null; title: string | null;
  hasPassword: boolean; allowDownload: boolean; allowOriginalDownload: boolean;
  expiresAt: string | null; status: string; createdByName: string | null; createdAt: string;
  viewCount: number; downloadCount: number; lastAccessedAt: string | null;
}

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

/** 사진첩 → 외부 공유 관리(요청서 47번) — 관리자는 전체, 일반 사용자는 API가 알아서
 * 본인 것만 반환한다(app/api/photos/external-shares/route.ts). */
export default function PhotoSharesAdminPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/photos/external-shares');
      const data = await res.json();
      setShares(data.shares || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string) => {
    if (!confirm('이 공유 링크를 즉시 폐기할까요? 이미 공유된 링크로도 더 이상 접근할 수 없습니다.')) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/photos/external-shares/${id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '관리자 폐기' }),
      });
      if (res.ok) setShares(prev => prev.map(s => s.id === id ? { ...s, status: 'revoked' } : s));
    } finally {
      setRevoking(null);
    }
  };

  const copyLink = async (id: string) => {
    const res = await fetch(`/api/photos/external-shares/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.token) return;
    const url = `${window.location.origin}/share/photos/${data.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!me) return <div className="p-8 text-sm text-muted-foreground">불러오는 중...</div>;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      <AppHeader title="사진첩 외부 공유 관리" />
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : shares.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-2 text-muted-foreground">
            <Link2 className="w-10 h-10" /><p className="text-sm">생성된 외부 공유 링크가 없습니다</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 font-medium">제목/대상</th>
                <th className="font-medium">생성자</th>
                <th className="font-medium">만료</th>
                <th className="font-medium text-center">조회</th>
                <th className="font-medium text-center">다운로드</th>
                <th className="font-medium">상태</th>
                <th className="font-medium text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shares.map(s => {
                const isExpired = s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
                const effectiveStatus = s.status === 'active' && isExpired ? 'expired' : s.status;
                return (
                  <tr key={s.id}>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {s.hasPassword && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="truncate max-w-[220px]">{s.title || `(${s.targetType} 공유)`}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{s.createdByName || '-'}</td>
                    <td className="text-muted-foreground">{fmtDate(s.expiresAt)}</td>
                    <td className="text-center text-muted-foreground"><span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{s.viewCount}</span></td>
                    <td className="text-center text-muted-foreground"><span className="inline-flex items-center gap-1"><Download className="w-3 h-3" />{s.downloadCount}</span></td>
                    <td>
                      <span className={
                        effectiveStatus === 'active' ? 'text-green-600 text-xs' :
                        effectiveStatus === 'revoked' ? 'text-red-600 text-xs' : 'text-amber-600 text-xs'
                      }>
                        {effectiveStatus === 'active' ? '활성' : effectiveStatus === 'revoked' ? '폐기됨' : '만료됨'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {effectiveStatus === 'active' && (
                          <button onClick={() => copyLink(s.id)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                            {copiedId === s.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                        {s.status === 'active' && (
                          <button onClick={() => revoke(s.id)} disabled={revoking === s.id}
                            className="text-xs text-red-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                            <Trash2 className="w-3 h-3" />폐기
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && shares.some(s => s.status === 'active' && s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-3"><AlertTriangle className="w-3.5 h-3.5" />만료된 링크는 접근 시 자동으로 만료 처리됩니다(상태는 다음 접근 시 갱신).</p>
        )}
      </div>
    </div>
  );
}
