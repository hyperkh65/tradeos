'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Copy, Check, Link as LinkIcon } from 'lucide-react';
import QRCode from 'qrcode';

interface ExternalShareModalProps {
  photoIds: string[];
  onClose: () => void;
}

/** 그리드 다중선택 사진들을 외부 공유 링크로 발행(요청서 42~46번). */
export function ExternalShareModal({ photoIds, onClose }: ExternalShareModalProps) {
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [maxDays, setMaxDays] = useState<number | null>(null);

  // 관리자 설정의 기본값(원본다운로드/워터마크 기본값, 최대 허용기간)을 반영 — 요청서 46번.
  useEffect(() => {
    fetch('/api/photos/settings').then(r => r.json()).then(j => {
      if (!j.settings) return;
      setAllowOriginalDownload(j.settings.defaultAllowOriginalDownload);
      setWatermark(j.settings.defaultWatermark);
      setMaxDays(j.settings.maxExternalShareDays);
      setExpiresInDays(prev => String(Math.min(Number(prev) || j.settings.maxExternalShareDays, j.settings.maxExternalShareDays)));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/photos/external-shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'selection', photoIds,
          title: title || undefined, password: password || undefined,
          allowDownload, allowOriginalDownload, allowZip: true, watermark,
          expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || '생성 실패'); return; }
      const data = await res.json();
      setResult({ url: data.url });
      const qr = await QRCode.toDataURL(data.url, { width: 200, margin: 1 });
      setQrDataUrl(qr);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><LinkIcon className="w-4 h-4" />외부 공유 ({photoIds.length}장)</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {result ? (
          <div className="p-4 space-y-3 text-center">
            {qrDataUrl && <img src={qrDataUrl} alt="QR" className="mx-auto rounded-md border border-border" />}
            <div className="flex items-center gap-1.5">
              <input readOnly value={result.url} className="flex-1 h-8 text-xs border border-border rounded-md px-2 bg-muted/30" />
              <button onClick={copyLink} className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs flex items-center gap-1 shrink-0">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">이 링크는 관리자 화면(외부 공유 관리)에서 언제든 폐기할 수 있습니다.</p>
            <button onClick={onClose} className="w-full h-8 text-xs rounded-md border border-border">닫기</button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">제목(선택)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 신제품 사진 공유"
                className="w-full h-8 text-xs border border-border rounded-md px-2 bg-background" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">비밀번호(선택)</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비워두면 비밀번호 없이 접근"
                className="w-full h-8 text-xs border border-border rounded-md px-2 bg-background" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">만료(일){maxDays != null && ` — 최대 ${maxDays}일`}</label>
              <input type="number" min={1} max={maxDays ?? undefined} value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)}
                className="w-full h-8 text-xs border border-border rounded-md px-2 bg-background" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} />다운로드 허용
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowOriginalDownload} onChange={e => setAllowOriginalDownload(e.target.checked)} />원본 다운로드 허용
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} />워터마크 표시(YNK, 감상용 이미지에만)
            </label>
            <button onClick={create} disabled={creating}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}공유 링크 생성
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
