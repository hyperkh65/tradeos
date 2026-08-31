'use client';

import { useEffect, useState } from 'react';
import { Loader2, Download, Copy, Check, Construction, CalendarDays, HardDrive, ShieldAlert } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

interface ReleaseInfo {
  id: string;
  platform: string;
  architecture: string;
  version: string;
  build_number: string | null;
  file_name: string;
  file_size: number;
  sha256: string;
  release_notes: string | null;
  minimum_os: string | null;
  created_at: string;
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ReleaseDownloadCard({ platform }: { platform: 'windows' | 'macos' }) {
  const [release, setRelease] = useState<ReleaseInfo | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/settings/app-releases/latest?platform=${platform}`)
      .then(r => r.json())
      .then(j => setRelease(j.data ?? null))
      .catch(() => setRelease(null));
  }, [platform]);

  if (release === undefined) {
    return (
      <div className="border border-border rounded-xl p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        릴리스 정보 확인 중...
      </div>
    );
  }

  if (!release) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
        <Construction className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">{platform === 'windows' ? 'Windows' : 'macOS'} 설치파일은 아직 준비되지 않았습니다.</p>
          <p className="text-xs mt-1 text-amber-700">배포되면 이 화면에서 실제 다운로드 링크와 버전 정보를 제공합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">버전 {release.version}{release.build_number ? ` (build ${release.build_number})` : ''}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{release.architecture} · {formatSize(release.file_size)}</p>
          </div>
          <a
            href={`/api/settings/app-releases/${release.id}/download`}
            className={buttonVariants({ size: 'lg', className: 'gap-2 shrink-0' })}
          >
            <Download className="w-4 h-4" />
            다운로드
          </a>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          {formatDate(release.created_at)} 배포
          {release.minimum_os && <><span className="mx-1">·</span><HardDrive className="w-3.5 h-3.5 shrink-0" />최소 {release.minimum_os}</>}
        </div>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(release.sha256); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="w-full flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono bg-muted/50 rounded-lg px-2.5 py-1.5 text-left"
        >
          {copied ? <Check className="w-3 h-3 shrink-0 text-green-600" /> : <Copy className="w-3 h-3 shrink-0" />}
          <span className="truncate">SHA-256: {release.sha256}</span>
        </button>
      </div>

      {release.release_notes && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{release.release_notes}</p>
        </div>
      )}
    </div>
  );
}
