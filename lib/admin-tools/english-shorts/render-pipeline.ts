import { execFfmpeg, probeFile } from './ffmpeg-exec';

/** 렌더에 쓸 클립 하나 — 이미 절대경로로 존재하는 원본 파일과 트림 구간.
 * hasAudio는 소스 업로드 시 ffprobe로 확인된 값(오디오 트랙이 없는 클립은
 * anullsrc로 무음 오디오를 만들어 concat 트랙 수를 맞춘다 — 가짜 오디오를
 * "있다"고 속이지 않고 무음으로 명시). */
export interface RenderClipInput {
  sourcePath: string;
  trimStartSec: number;
  trimEndSec: number;
  hasAudio: boolean;
}

export interface RenderOptions {
  outputWidth?: number;
  outputHeight?: number;
  fps?: number;
  videoBitrateK?: number;
  audioBitrateK?: number;
  /** 이미 디스크에 쓰여진 .ass 파일의 절대경로. null이면 자막 오버레이 없이 인코딩만 한다. */
  assSubtitlePath?: string | null;
  /** ass 필터의 fontsdir — Noto Sans KR Bold가 있는 디렉터리 절대경로. */
  fontsDir?: string | null;
}

export interface RenderResult {
  outputPath: string;
  thumbnailPath: string;
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  fileSizeBytes: number;
}

/** libavfilter 필터 인자 안에서 콜론/작은따옴표/백슬래시는 특별 취급되므로
 * 파일 경로를 filter_complex 문자열에 삽입할 때 이스케이프한다. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

/** 클립 여러 개(코덱/해상도가 서로 달라도 됨)를 트림+정규화+concat하고,
 * 필요하면 ASS 자막을 번인해 1080x1920 h264/aac MP4로 인코딩하는 순수 함수.
 * DB/큐를 전혀 몰라도 되게 순수 입출력 경로만 받는다(Phase 12/13에서 워커가
 * 이 함수를 호출). 완료 판정 전 ffprobe로 실제 결과물을 검증해 가짜 성공을
 * 절대 반환하지 않는다. */
export async function renderProjectVideo(
  clips: RenderClipInput[],
  outputPath: string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  if (clips.length === 0) throw new Error('렌더할 클립이 없습니다');

  const width = opts.outputWidth ?? 1080;
  const height = opts.outputHeight ?? 1920;
  const fps = opts.fps ?? 30;
  const videoBitrateK = opts.videoBitrateK ?? 6000;
  const audioBitrateK = opts.audioBitrateK ?? 128;

  const args: string[] = ['-y'];
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  clips.forEach((clip, i) => {
    args.push('-ss', String(clip.trimStartSec), '-to', String(clip.trimEndSec), '-i', clip.sourcePath);
    filterParts.push(
      `[${i}:v]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${i}]`
    );
    if (clip.hasAudio) {
      filterParts.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`);
    } else {
      const durationSec = Math.max(0, clip.trimEndSec - clip.trimStartSec);
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100:d=${durationSec},` +
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`
      );
    }
    concatInputs.push(`[v${i}][a${i}]`);
  });

  filterParts.push(`${concatInputs.join('')}concat=n=${clips.length}:v=1:a=1[vcat][acat]`);

  let videoOutLabel = 'vcat';
  if (opts.assSubtitlePath) {
    const assArg = opts.fontsDir
      ? `ass=filename='${escapeFilterPath(opts.assSubtitlePath)}':fontsdir='${escapeFilterPath(opts.fontsDir)}'`
      : `ass=filename='${escapeFilterPath(opts.assSubtitlePath)}'`;
    filterParts.push(`[vcat]${assArg}[vsub]`);
    videoOutLabel = 'vsub';
  }

  args.push(
    '-filter_complex', filterParts.join(';'),
    '-map', `[${videoOutLabel}]`,
    '-map', '[acat]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${videoBitrateK}k`,
    '-c:a', 'aac', '-b:a', `${audioBitrateK}k`,
    '-r', String(fps),
    '-movflags', '+faststart',
    outputPath,
  );

  await execFfmpeg(args);

  const probed = await probeFile(outputPath);
  if (!probed) throw new Error('렌더 결과물을 ffprobe로 검증하지 못했습니다(파일이 실제로 만들어지지 않았을 수 있음)');
  const videoStream = probed.streams.find(s => s.codec_type === 'video');
  const audioStream = probed.streams.find(s => s.codec_type === 'audio');
  const durationSec = probed.format.duration ? parseFloat(probed.format.duration) : 0;
  const fileSizeBytes = probed.format.size ? parseInt(probed.format.size, 10) : 0;
  if (!videoStream || !durationSec) throw new Error('렌더 결과물에 유효한 비디오 스트림이 없습니다');

  return {
    outputPath,
    thumbnailPath: '',
    durationSec,
    width: videoStream.width ?? width,
    height: videoStream.height ?? height,
    videoCodec: videoStream.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    fileSizeBytes,
  };
}

/** 완성된 mp4에서 썸네일 프레임을 뽑는다(별도 2차 호출 — 본 인코딩 실패와
 * 썸네일 실패를 구분해서 처리할 수 있게). */
export async function extractThumbnail(videoPath: string, thumbnailPath: string, atSec = 0.5): Promise<void> {
  await execFfmpeg(['-y', '-ss', String(atSec), '-i', videoPath, '-frames:v', '1', '-q:v', '3', thumbnailPath]);
  const probed = await probeFile(thumbnailPath);
  if (!probed || !probed.streams.find(s => s.codec_type === 'video')) {
    throw new Error('썸네일 파일 생성을 ffprobe로 검증하지 못했습니다');
  }
}
