'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Lock } from 'lucide-react';

// 기존 매출관리(crm) 페이지의 "전월 매출 수정" 관리자 확인 방식과 동일한 패턴
const ADMIN_PASSWORD = '1209';

function isOlderThanMonth(dateStr: string) {
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  return d < cutoff;
}

function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(false);
  const check = () => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3"><Lock className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">1개월 이상 지난 문서 삭제</h3></div>
        <p className="text-sm text-muted-foreground mb-4">작성일로부터 1개월이 지난 문서는 관리자만 삭제할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && check()} className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button><Button className="flex-1" onClick={check}>확인</Button></div>
      </div>
    </div>
  );
}

export function DocumentDeleteButton({ id, createdAt, onDeleted, className }: {
  id: string; createdAt: string; onDeleted: () => void; className?: string;
}) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || '삭제하지 못했습니다.');
        return;
      }
      onDeleted();
    } finally { setDeleting(false); }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 문서를 삭제하시겠습니까?')) return;
    if (isOlderThanMonth(createdAt)) { setShowAdmin(true); return; }
    void doDelete();
  };

  return (
    <>
      <button onClick={handleClick} disabled={deleting} title="삭제" className={className || 'text-muted-foreground hover:text-red-600'}>
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {showAdmin && (
        <AdminPasswordModal onCancel={() => setShowAdmin(false)} onConfirm={() => { setShowAdmin(false); void doDelete(); }} />
      )}
    </>
  );
}
