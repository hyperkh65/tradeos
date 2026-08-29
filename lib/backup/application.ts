import fs from 'fs';
import path from 'path';
import { getAppRootDir } from '../db/backup';

export interface ApplicationArtifacts {
  packageJsonPath: string | null;
  packageLockPath: string | null;
  nextConfigPath: string | null;
  buildInfoPath: string | null;
}

/** Complete Package의 /application 폴더에 넣을 소스 참조 파일들의 실제 경로.
 * 무거운 standalone 실행 바이너리 자체는 기존 lib/db/backup.ts의 runFullAppBackup()가
 * 만드는 별도 tar.gz를 그대로 재사용한다(중복 구현하지 않음) — 여기서는 "이 백업이
 * 어떤 버전/의존성으로 만들어졌는지"를 압축을 풀지 않고도 바로 확인할 수 있는 가벼운
 * 참조 파일들만 모은다. */
export function locateApplicationArtifacts(): ApplicationArtifacts {
  const root = getAppRootDir();
  const find = (rel: string) => { const p = path.join(root, rel); return fs.existsSync(p) ? p : null; };
  // 배포 스크립트가 언젠가 다시 바뀌어도 조용히 깨지지 않도록, 앱 루트에 없으면
  // Next.js standalone 산출물 안에 자동 포함되는 사본(.next/standalone/package.json)을
  // 대체 경로로 확인한다 — standalone용은 런타임 의존성만 남긴 축약본이라 원본이
  // 있으면 그게 우선이지만, 원본이 없을 때 완전히 빈 백업이 되는 것보다는 낫다.
  return {
    packageJsonPath: find('package.json') || find('.next/standalone/package.json'),
    packageLockPath: find('package-lock.json'),
    nextConfigPath: find('next.config.ts') || find('next.config.js') || find('next.config.mjs'),
    buildInfoPath: find('BUILD_INFO.json'),
  };
}
