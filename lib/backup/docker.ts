import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export interface DockerServiceSpec { name: string; image: string; ports: string[]; volumes: string[] }

/** 현재 raw `docker run` 스크립트(.github/workflows/deploy.yml)로 실행 중인 두
 * 사이드카(Qdrant/docverify)를 docker-compose.yml 형태로 합성한다 — 실제 배포 방식을
 * 바꾸는 게 아니라, 복구 시 더 이해하기 쉬운 대체 경로/문서로 패키지에 포함한다. */
export function synthesizeDockerCompose(services: DockerServiceSpec[]): string {
  const lines: string[] = ['services:'];
  for (const s of services) {
    lines.push(`  ${s.name}:`);
    lines.push(`    image: ${s.image}`);
    lines.push(`    container_name: ${s.name}`);
    lines.push('    restart: unless-stopped');
    if (s.ports.length) {
      lines.push('    ports:');
      for (const p of s.ports) lines.push(`      - "${p}"`);
    }
    if (s.volumes.length) {
      lines.push('    volumes:');
      for (const v of s.volumes) lines.push(`      - "${v}"`);
    }
  }
  return lines.join('\n') + '\n';
}

export interface ImageSaveResult { image: string; file: string | null; ok: boolean; error: string | null }

/** 이미지를 오프라인 tar 아카이브로 저장한다(Docker registry가 사라져도 복원 가능하게).
 * Docker가 없는 환경(예: 개발 sandbox)에서는 항상 안전하게 실패를 반환한다. */
export function saveDockerImagesOffline(destDir: string, images: string[]): ImageSaveResult[] {
  const dockerBin = process.env.DOCVERIFY_DOCKER_BIN || 'docker';
  const results: ImageSaveResult[] = [];
  fs.mkdirSync(destDir, { recursive: true });
  for (const image of images) {
    const safeName = image.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.tar';
    const dest = path.join(destDir, safeName);
    try {
      execFileSync(dockerBin, ['save', '-o', dest, image], { timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 * 100 });
      results.push({ image, file: safeName, ok: true, error: null });
    } catch (e) {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      results.push({ image, file: null, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
