'use client';

import { useEffect, useState } from 'react';
import { Loader2, Monitor, CheckCircle2, ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { detectPlatform } from '@/hooks/use-pwa-install';

// Tauri v2의 withGlobalTauri 옵션으로 원격 페이지(이 앱)에 주입되는 전역 객체.
// @tauri-apps/api 패키지를 번들링하지 않고도(원격 URL 셸이라 프론트엔드를 따로 두지 않음)
// 데스크톱 앱 안에서만 window.__TAURI__로 네이티브 정보를 조회할 수 있다.
interface TauriGlobal {
  app: { getVersion(): Promise<string> };
}
declare global {
  interface Window { __TAURI__?: TauriGlobal }
}

interface ReleaseInfo { latestVersion: string | null; downloadUrl: string | null }
interface BootstrapResponse { serverUrl: string; releases: { windows: ReleaseInfo; macos: ReleaseInfo } }

export function UpdateCheckCard() {
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [checked, setChecked] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI__) { setChecked(true); return; }
    setIsDesktopApp(true);

    const platform = detectPlatform();
    const releaseKey = platform === 'windows' ? 'windows' : platform === 'macos' ? 'macos' : null;

    Promise.all([
      window.__TAURI__.app.getVersion(),
      fetch('/api/desktop/bootstrap').then(r => r.json() as Promise<BootstrapResponse>).catch(() => null),
    ]).then(([version, bootstrap]) => {
      setCurrentVersion(version);
      if (bootstrap && releaseKey) setRelease(bootstrap.releases[releaseKey]);
    }).finally(() => setChecked(true));
  }, []);

  if (!checked || !isDesktopApp) return null;

  const hasNewer = !!(release?.latestVersion && currentVersion && release.latestVersion !== currentVersion);

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Monitor className="w-4 h-4 text-muted-foreground" />
        데스크톱 앱 정보
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p>설치된 버전: <span className="font-medium text-foreground">{currentVersion ?? '확인 중...'}</span></p>
        {release?.latestVersion ? (
          <p>최신 버전: <span className="font-medium text-foreground">{release.latestVersion}</span></p>
        ) : (
          <p>최신 버전 정보 없음 — 아직 배포된 릴리스가 없습니다.</p>
        )}
      </div>
      {hasNewer ? (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="flex-1">새 버전이 있습니다. 최신 설치파일을 내려받아 직접 설치해주세요(자동 업데이트 아님).</span>
          {release?.downloadUrl && (
            <a
              href={release.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'outline', className: 'gap-1 shrink-0' })}
            >
              <ExternalLink className="w-3 h-3" />다운로드
            </a>
          )}
        </div>
      ) : currentVersion && release?.latestVersion && (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          최신 버전을 사용 중입니다.
        </div>
      )}
    </div>
  );
}

export function UpdateCheckCardSkeleton() {
  return (
    <div className="border border-border rounded-xl p-4 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      데스크톱 앱 정보 확인 중...
    </div>
  );
}
