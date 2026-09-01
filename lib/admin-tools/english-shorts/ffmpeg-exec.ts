import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * FFmpeg/ffprobe 실행 — 항상 인자 배열로만 호출한다(execFile, 셸 문자열 절대
 * 금지, 사용자 입력이 섞여도 shell injection 불가능하게). 프로덕션 NAS에선
 * FFMPEG_CONTAINER(기본 'tradeos-ffmpeg')가 설정되어 있으면 docker exec로
 * 컨테이너 안의 ffmpeg를 실행한다(lib/approval-doc/libreoffice-convert.ts의
 * docverify와 동일 패턴 — Phase 9에서 실제로 그 컨테이너를 NAS에 띄운다).
 * 이 로컬 개발 환경처럼 FFMPEG_CONTAINER가 없으면 로컬 ffmpeg 바이너리로
 * 폴백한다.
 */
const DOCKER_BIN = process.env.FFMPEG_DOCKER_BIN || '/var/packages/ContainerManager/target/usr/bin/docker';
const FFMPEG_CONTAINER = process.env.FFMPEG_CONTAINER?.trim() || null;
const EXEC_TIMEOUT_MS = 15 * 60_000;
const MAX_BUFFER = 20 * 1024 * 1024;

async function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  if (FFMPEG_CONTAINER) {
    return execFileAsync(DOCKER_BIN, ['exec', FFMPEG_CONTAINER, bin, ...args], { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  }
  return execFileAsync(bin, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
}

export async function execFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run('ffmpeg', args);
}

export async function execFfprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run('ffprobe', args);
}

export interface FfprobeStream {
  index: number;
  codec_type: 'video' | 'audio' | string;
  codec_name?: string;
  width?: number;
  height?: number;
}
export interface FfprobeFormat {
  duration?: string;
  size?: string;
}
export interface FfprobeResult {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

/** 파일 메타데이터를 JSON으로 뽑는다 — Source 업로드 시 duration/width/height/
 * codec을 정직하게(추측 없이) 채우는 데 쓴다. 실패하면 null(호출자가 "메타데이터
 * 확인 불가"로 명확히 표시하지, 가짜 값을 채우지 않는다). */
export async function probeFile(filePath: string): Promise<FfprobeResult | null> {
  try {
    const { stdout } = await execFfprobe(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
    return JSON.parse(stdout) as FfprobeResult;
  } catch (e) {
    console.error('[ffprobe]', e);
    return null;
  }
}

export async function getFfmpegVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFfmpeg(['-version']);
    return stdout.split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

export async function getFfprobeVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFfprobe(['-version']);
    return stdout.split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

export function isFfmpegDockerConfigured(): boolean {
  return !!FFMPEG_CONTAINER;
}
