import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getProjectById, updateProject, listProjectSources } from './db';
import {
  claimNextRenderJobs, updateRenderJobProgress, completeRenderJob, failRenderJob,
  recoverStaleRenderJobs, insertRenderLog, type RenderJobRow,
} from './render-db';
import { renderProjectVideo, extractThumbnail, type RenderClipInput } from './render-pipeline';
import { buildAssFile, ensureSubtitleFontDeployed, type AssStyleOptions } from './ass-builder';
import { buildRenderOutputPath, buildRenderThumbnailPath, uploadEnglishShortsFile } from './storage';
import { getEnglishShortsSettings } from './settings';
import { writeEnglishShortsAuditLog } from './audit';

/** 진행률 단계 — 요청서가 요구한 6단계. FFmpeg 인코딩 자체는 하나의 프로세스
 * 호출이라(진행률 파이프 파싱은 이번 phase 범위 밖) 각 단계 "시작 시점"에서
 * 퍼센트를 갱신하는 방식이다 — 인코딩 도중 세밀한 %는 아직 제공하지 않는다
 * (거짓으로 세밀한 진행률을 흉내내지 않음, 정직하게 단계 전환만 표시). */
type RenderStage = 'preparing' | 'processing_video' | 'generating_subtitles' | 'composing' | 'encoding' | 'finalizing';
const STAGE_LABEL: Record<RenderStage, string> = {
  preparing: 'Preparing',
  processing_video: 'Processing video',
  generating_subtitles: 'Generating subtitles',
  composing: 'Composing',
  encoding: 'Encoding',
  finalizing: 'Finalizing',
};
function setProgress(jobId: string, stage: RenderStage, progress: number): void {
  updateRenderJobProgress(jobId, STAGE_LABEL[stage], progress);
}

/** layout.defaults(Phase 8 템플릿) → ass-builder의 AssStyleOptions로 변환.
 * 템플릿이 없으면 ass-builder 자체 기본값(흰 글자/검정 외곽선/하단)을 쓴다. */
function templateLayoutToAssOptions(defaults: Record<string, unknown> | undefined): AssStyleOptions {
  if (!defaults) return {};
  return {
    position: defaults.subtitlePosition as AssStyleOptions['position'],
    fontSizePt: defaults.fontSizePt as number | undefined,
    primaryColorHex: defaults.primaryColorHex as string | undefined,
    outlineColorHex: defaults.outlineColorHex as string | undefined,
    marginVPx: defaults.marginVPx as number | undefined,
    boxBackground: defaults.boxBackground as boolean | undefined,
    cardColorHex: defaults.cardColorHex as string | undefined,
    cardOpacity: defaults.cardOpacity as number | undefined,
  };
}

/** 잡 하나를 실제로 렌더링한다 — 실패하면 예외를 던지고(호출자가 재시도/최종실패
 * 처리), 완료 판정 전 파일 검증은 render-pipeline.ts가 이미 ffprobe로 수행한다. */
export async function processRenderJob(job: RenderJobRow): Promise<void> {
  insertRenderLog(job.id, 'info', `렌더 시작 (project=${job.projectId})`);
  setProgress(job.id, 'preparing', 5);

  const project = getProjectById(job.projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다');
  const links = listProjectSources(job.projectId);
  if (links.length === 0) throw new Error('연결된 소스 클립이 없습니다');

  const clips: RenderClipInput[] = links.map(link => {
    const trimEnd = link.trimEndSec ?? link.source.durationSec;
    if (trimEnd == null) throw new Error(`소스(${link.source.originalFileName ?? link.sourceId})의 길이를 알 수 없어 트림 종료 시점을 정할 수 없습니다`);
    if (!link.source.storedPath) throw new Error(`소스(${link.source.originalFileName ?? link.sourceId}) 파일 경로가 없습니다`);
    return {
      sourcePath: link.source.storedPath,
      trimStartSec: link.trimStartSec,
      trimEndSec: trimEnd,
      hasAudio: !!link.source.audioCodec,
    };
  });

  setProgress(job.id, 'generating_subtitles', 15);
  let assPath: string | null = null;
  let fontsDir: string | null = null;
  const captionText = project.caption?.trim();
  if (captionText) {
    const totalDurationSec = clips.reduce((sum, c) => sum + Math.max(0, c.trimEndSec - c.trimStartSec), 0);
    const styleOpts = templateLayoutToAssOptions(
      (project.templateSettings as Record<string, unknown> | null) ?? undefined
    );
    const ass = buildAssFile([{ startSec: 0, endSec: totalDurationSec, text: captionText }], styleOpts);
    assPath = path.join(os.tmpdir(), `es-render-${job.id}.ass`);
    await fs.writeFile(assPath, ass, 'utf8');

    const font = await ensureSubtitleFontDeployed();
    if (font.absolutePath) {
      fontsDir = path.dirname(font.absolutePath);
    } else {
      insertRenderLog(job.id, 'warn', 'WebDAV 저장소 설정에서는 로컬 fontsdir을 확보할 수 없어 이번 렌더는 자막 없이 진행합니다');
      assPath = null;
    }
  } else {
    insertRenderLog(job.id, 'info', '프로젝트에 캡션 텍스트가 없어 자막 없이 렌더링합니다');
  }

  setProgress(job.id, 'processing_video', 30);
  setProgress(job.id, 'composing', 45);
  setProgress(job.id, 'encoding', 60);

  const settings = getEnglishShortsSettings();
  const outputTmpPath = path.join(os.tmpdir(), `es-render-${job.id}-output.mp4`);
  const thumbTmpPath = path.join(os.tmpdir(), `es-render-${job.id}-thumb.jpg`);
  const result = await renderProjectVideo(clips, outputTmpPath, {
    fps: settings.outputFps,
    videoBitrateK: settings.outputVideoBitrateK,
    audioBitrateK: settings.outputAudioBitrateK,
    assSubtitlePath: assPath,
    fontsDir,
  });

  setProgress(job.id, 'finalizing', 85);
  await extractThumbnail(outputTmpPath, thumbTmpPath, Math.min(0.5, result.durationSec / 2));

  const outputBuf = await fs.readFile(outputTmpPath);
  const thumbBuf = await fs.readFile(thumbTmpPath);
  const outputRel = buildRenderOutputPath(job.projectId, job.id);
  const thumbRel = buildRenderThumbnailPath(job.projectId, job.id);
  const outputUpload = await uploadEnglishShortsFile(outputRel, outputBuf, 'video/mp4');
  const thumbUpload = await uploadEnglishShortsFile(thumbRel, thumbBuf, 'image/jpeg');
  if (!outputUpload.success || !outputUpload.path) throw new Error(`결과물 저장 실패: ${outputUpload.error}`);
  if (!thumbUpload.success || !thumbUpload.path) throw new Error(`썸네일 저장 실패: ${thumbUpload.error}`);

  await Promise.all([
    fs.unlink(outputTmpPath).catch(() => {}),
    fs.unlink(thumbTmpPath).catch(() => {}),
    assPath ? fs.unlink(assPath).catch(() => {}) : Promise.resolve(),
  ]);

  completeRenderJob(job.id, {
    outputVideoPath: outputUpload.path,
    outputThumbnailPath: thumbUpload.path,
    outputDurationSec: result.durationSec,
    outputFileSize: outputBuf.length,
  });
  updateProject(job.projectId, {
    status: 'completed',
    outputVideoPath: outputUpload.path,
    outputThumbnailPath: thumbUpload.path,
    outputDurationSec: result.durationSec,
  });
  writeEnglishShortsAuditLog({
    projectId: job.projectId, userId: job.requestedBy, userName: job.requestedByName,
    action: 'RENDER_COMPLETED', after: { jobId: job.id, durationSec: result.durationSec, width: result.width, height: result.height },
  });
  insertRenderLog(job.id, 'info', `렌더 완료: ${result.width}x${result.height}, ${result.durationSec.toFixed(2)}초, ${outputBuf.length} bytes`);
}

/** instrumentation.ts에서 등록한 setInterval이 매 tick마다 부른다 —
 * 사진첩 processNextPhotoJobs()와 동일한 claim-then-process 구조. */
export async function processNextRenderJobs(): Promise<void> {
  const recovered = recoverStaleRenderJobs();
  if (recovered > 0) console.warn(`[render-worker] ${recovered}개 stale job 회수`);

  const jobs = claimNextRenderJobs();
  for (const job of jobs) {
    try {
      await processRenderJob(job);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      insertRenderLog(job.id, 'error', message);
      const finalFailed = failRenderJob(job.id, message);
      if (finalFailed) {
        updateProject(job.projectId, { status: 'failed' });
        writeEnglishShortsAuditLog({
          projectId: job.projectId, userId: job.requestedBy, userName: job.requestedByName,
          action: 'RENDER_FAILED', after: { jobId: job.id, error: message },
        });
      }
    }
  }
}
