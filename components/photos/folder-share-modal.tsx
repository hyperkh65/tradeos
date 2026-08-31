'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Users, Trash2 } from 'lucide-react';

interface ShareRow { id: string; sharedWithUserId: string; sharedWithUserName: string; permissionLevel: string }
interface PickUser { id: string; name: string; department: string | null }

const LEVEL_LABELS: Record<string, string> = {
  view: '조회', download: '다운로드', upload: '업로드', edit: '편집', share: '공유관리', delete: '삭제',
};

/** 폴더 단위 사내 공유(요청서 38번) — 대상 사용자 + 권한레벨 부여/해제. */
export function FolderShareModal({ folderId, folderName, onClose }: { folderId: string; folderName: string; onClose: () => void }) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [users, setUsers] = useState<PickUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [level, setLevel] = useState('view');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sharesRes, usersRes] = await Promise.all([
        fetch(`/api/photos/folders/${folderId}/shares`),
        fetch('/api/admin/users'),
      ]);
      const sharesData = await sharesRes.json();
      const usersData = await usersRes.json();
      setShares(sharesData.shares || []);
      setUsers(usersData.data || []);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { load(); }, [load]);

  const addShare = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/photos/folders/${folderId}/shares`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, permissionLevel: level }),
      });
      if (res.ok) { setSelectedUserId(''); await load(); }
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (shareId: string) => {
    setShares(prev => prev.filter(s => s.id !== shareId));
    await fetch(`/api/photos/shares/${shareId}`, { method: 'DELETE' });
  };

  const sharedIds = new Set(shares.map(s => s.sharedWithUserId));

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><Users className="w-4 h-4" />&quot;{folderName}&quot; 공유</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="flex-1 h-8 text-xs border border-border rounded-md bg-background px-2">
              <option value="">사용자 선택…</option>
              {users.filter(u => !sharedIds.has(u.id)).map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
              ))}
            </select>
            <select value={level} onChange={e => setLevel(e.target.value)} className="h-8 text-xs border border-border rounded-md bg-background px-2">
              {Object.entries(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={addShare} disabled={!selectedUserId || saving} className="h-8 text-xs px-2.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 shrink-0">추가</button>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">공유된 사용자가 없습니다</p>
            ) : shares.map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-2.5 py-1.5">
                <span>{s.sharedWithUserName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{LEVEL_LABELS[s.permissionLevel] || s.permissionLevel}</span>
                  <button onClick={() => revoke(s.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
