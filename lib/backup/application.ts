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
  return {
    packageJsonPath: find('package.json'),
    packageLockPath: find('package-lock.json'),
    nextConfigPath: find('next.config.ts') || find('next.config.js') || find('next.config.mjs'),
    buildInfoPath: find('BUILD_INFO.json'),
  };
}
