import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getProjectById, updateProject, listProjectSources, getExpressionById, getTemplateById } from './db';
import {
  claimNextRenderJobs, updateRenderJobProgress, completeRenderJob, failRenderJob,
  recoverStaleRenderJobs, insertRenderLog, getRenderJobById, markRenderJobCancelled, type RenderJobRow,
} from './render-db';
import { renderProjectVideo, extractThumbnail, type RenderClipInput, type RenderOptions } from './render-pipeline';
import { buildAssFile, ensureSubtitleFontDeployed, type AssStyleOptions, type AssCue } from './ass-builder';
import { renderCardPng, renderGradientBarPng, renderRoundedCornerMaskPng } from './card-renderer';
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

/** 레터박스 훅 하단 바에는 AI가 만든 2~3문장짜리 explanation을 통째로 못 넣는다
 * (화면에 한 줄만 들어갈 공간) — 첫 문장만 잘라 쓰고, 그래도 너무 길면 글자수로
 * 자른다. 추가 AI 호출 없이 기존 explanation 필드를 그대로 재사용. */
function firstSentence(text: string, maxLen = 60): string {
  const trimmed = text.trim();
  const idx = trimmed.search(/[.!?。！？]/);
  const sentence = idx >= 0 ? trimmed.slice(0, idx + 1) : trimmed;
  return sentence.length > maxLen ? `${sentence.slice(0, maxLen - 1)}…` : sentence;
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
  let letterboxOpts: Pick<RenderOptions, 'videoRect' | 'imageOverlays'> = {};
  const tempImagePaths: string[] = [];
  const totalDurationSec = clips.reduce((sum, c) => sum + Math.max(0, c.trimEndSec - c.trimStartSec), 0);

  const template = project.templateId ? getTemplateById(project.templateId) : null;
  const layoutKind = template?.layout.kind;

  // 레터박스 훅 — 위/아래 고정 텍스트 바 + 가운데 letterbox 영상. 단일 캡션
  // 오버레이(기존 4개 템플릿 방식)와 완전히 다른 필터 그래프가 필요해 별도 분기.
  // 카드/그라데이션/모서리는 drawbox가 아니라 card-renderer.ts가 sharp로
  // 미리 그린 PNG(둥근모서리+그림자)를 overlay — drawbox만으로는 직각
  // 사각형밖에 못 그려 "밋밋해 보인다"는 실제 피드백을 받고 교체함.
  if (layoutKind === 'letterbox-hook') {
    const expression = getExpressionById(project.expressionId);
    const templateDefaults = template?.layout.defaults ?? {};
    const defaults = { ...templateDefaults, ...((project.templateSettings as Record<string, unknown> | null) ?? {}) };
    const hookText = String(defaults.hookText ?? '영어 잘해 보이는 표현.zip');
    const koreanText = expression?.koreanMeaning?.trim() || '';
    const englishText = expression?.expression?.trim() || '';
    const explanationText = expression?.explanation?.trim() ? firstSentence(expression.explanation) : '';
    const fontSizePt = Number(defaults.fontSizePt ?? 50);

    if (!koreanText || !englishText) {
      insertRenderLog(job.id, 'warn', '레터박스 훅 템플릿에 필요한 한국어 뜻/영어 표현 정보가 없어(AI 분석 미실행) 기본 자막 스타일로 대체합니다');
    } else {
      const W = 1080;
      // 쇼츠/틱톡 세이프존 실측 기준(YouTube Shorts 984x1500 안전영역, "하단
      // 250px 안에는 중요 텍스트 금지" — 플랫폼 자체 UI(좋아요/공유/설명)가
      // 그 영역을 가림) 반영: 맨 아래 250px는 완전히 비워두고, 캡션 카드는
      // 그 위에서 끝난다.
      const zones = {
        gradient: { top: 0, height: 140 },
        korean: { top: 140, height: 200 },
        english: { top: 340, height: 200 },
        video: { top: 540, height: 1010 },
        explanation: { top: 1550, height: 120 },
        bottomSafeMargin: 250,
      };
      const cardWidth = 900, cardHeight = 130, cardXOffset = (W - cardWidth) / 2;
      const koreanCardTop = zones.korean.top + (zones.korean.height - cardHeight) / 2;
      const englishCardTop = zones.english.top + (zones.english.height - cardHeight) / 2;
      const captionWidth = 760, captionHeight = 100, captionXOffset = (W - captionWidth) / 2;
      const captionTop = zones.explanation.top + (zones.explanation.height - captionHeight) / 2;
      const fadeInMs = 450;

      const cues: AssCue[] = [
        {
          startSec: 0, endSec: totalDurationSec, text: hookText, fadeInMs,
          styleOverride: { fontSizePt: 24, primaryColorHex: String(defaults.hookColorHex ?? '#FFFFFF') },
          posOverride: { x: W / 2, y: zones.gradient.top + zones.gradient.height / 2 },
        },
        {
          startSec: 0, endSec: totalDurationSec, text: koreanText, fadeInMs,
          styleOverride: { fontSizePt, primaryColorHex: String(defaults.koreanTextColorHex ?? '#FFFFFF') },
          posOverride: { x: W / 2, y: koreanCardTop + cardHeight / 2 },
        },
        {
          startSec: 0, endSec: totalDurationSec, text: englishText.toUpperCase(), fadeInMs,
          // 영어 표현만 Anton(굵은 디스플레이 폰트, Google Fonts OFL)로 —
          // 실제 인기 쇼츠 자막 리서치에서 Anton/Bebas Neue 계열이 표준으로
          // 언급됨. 한글은 라틴 전용 폰트라 커버 못해 Noto Sans KR을 유지.
          styleOverride: { fontSizePt: fontSizePt + 6, fontName: 'Anton', primaryColorHex: String(defaults.englishTextColorHex ?? '#FFFFFF') },
          posOverride: { x: W / 2, y: englishCardTop + cardHeight / 2 },
        },
      ];
      if (explanationText) {
        cues.push({
          startSec: 0, endSec: totalDurationSec, text: explanationText, fadeInMs,
          styleOverride: { fontSizePt: 30, primaryColorHex: String(defaults.explanationTextColorHex ?? '#F5D400') },
          posOverride: { x: W / 2, y: captionTop + captionHeight / 2 },
        });
      }
      const ass = buildAssFile(cues, {});
      assPath = path.join(os.tmpdir(), `es-render-${job.id}.ass`);
      await fs.writeFile(assPath, ass, 'utf8');

      const font = await ensureSubtitleFontDeployed();
      if (!font.absolutePath) {
        insertRenderLog(job.id, 'warn', 'WebDAV 저장소 설정에서는 로컬 fontsdir을 확보할 수 없어 이번 렌더는 자막 없이 진행합니다');
        assPath = null;
      } else {
        fontsDir = path.dirname(font.absolutePath);

        const gradientPng = await renderGradientBarPng({
          widthPx: W, heightPx: zones.gradient.height,
          colorStartHex: String(defaults.gradientStartHex ?? '#050505'),
          colorEndHex: String(defaults.gradientEndHex ?? '#242424'),
        });
        const koreanCard = await renderCardPng({
          widthPx: cardWidth, heightPx: cardHeight,
          colorHex: String(defaults.koreanBgColorHex ?? '#17171C'), opacity: Number(defaults.cardOpacity ?? 0.92),
          borderColorHex: String(defaults.cardBorderColorHex ?? '#FFFFFF'), borderOpacity: 0.55, borderWidthPx: 2,
          cornerRadiusPx: 28, shadow: true,
        });
        const englishCard = await renderCardPng({
          widthPx: cardWidth, heightPx: cardHeight,
          colorHex: String(defaults.englishBgColorHex ?? '#17171C'), opacity: Number(defaults.cardOpacity ?? 0.92),
          borderColorHex: String(defaults.cardBorderColorHex ?? '#FFFFFF'), borderOpacity: 0.55, borderWidthPx: 2,
          cornerRadiusPx: 28, shadow: true,
        });
        const captionCard = await renderCardPng({
          widthPx: captionWidth, heightPx: captionHeight,
          colorHex: String(defaults.explanationBgColorHex ?? '#101014'), opacity: 0.8,
          cornerRadiusPx: 20, shadow: true,
        });
        const cornerMask = await renderRoundedCornerMaskPng(W, zones.video.height, 36, '#000000');

        const gradientPath = path.join(os.tmpdir(), `es-render-${job.id}-gradient.png`);
        const koreanCardPath = path.join(os.tmpdir(), `es-render-${job.id}-korean.png`);
        const englishCardPath = path.join(os.tmpdir(), `es-render-${job.id}-english.png`);
        const captionCardPath = path.join(os.tmpdir(), `es-render-${job.id}-caption.png`);
        const cornerMaskPath = path.join(os.tmpdir(), `es-render-${job.id}-corners.png`);
        await Promise.all([
          fs.writeFile(gradientPath, gradientPng),
          fs.writeFile(koreanCardPath, koreanCard.buffer),
          fs.writeFile(englishCardPath, englishCard.buffer),
          fs.writeFile(captionCardPath, captionCard.buffer),
          fs.writeFile(cornerMaskPath, cornerMask),
        ]);
        tempImagePaths.push(gradientPath, koreanCardPath, englishCardPath, captionCardPath, cornerMaskPath);

        letterboxOpts = {
          videoRect: { topPx: zones.video.top, heightPx: zones.video.height },
          imageOverlays: [
            // 영상 위에 모서리 마스크를 먼저 얹어 둥근모서리처럼 보이게 한 뒤,
            // 그 위에 그라데이션 바/카드들을 쌓는다.
            { imagePath: cornerMaskPath, topPx: zones.video.top, xOffsetPx: 0 },
            { imagePath: gradientPath, topPx: zones.gradient.top, xOffsetPx: 0 },
            { imagePath: koreanCardPath, topPx: koreanCardTop - koreanCard.pad, xOffsetPx: cardXOffset - koreanCard.pad },
            { imagePath: englishCardPath, topPx: englishCardTop - englishCard.pad, xOffsetPx: cardXOffset - englishCard.pad },
            { imagePath: captionCardPath, topPx: captionTop - captionCard.pad, xOffsetPx: captionXOffset - captionCard.pad },
          ],
        };
      }
    }
  }

  // letterbox-hook이 아니거나(다른 4개 템플릿), letterbox-hook인데 필요한 정보가
  // 부족해 위 분기를 건너뛴 경우 기존 단일 캡션 오버레이 방식으로 렌더링한다.
  if (!letterboxOpts.videoRect) {
    const captionText = project.caption?.trim();
    if (captionText) {
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
    ...letterboxOpts,
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
    ...tempImagePaths.map(p => fs.unlink(p).catch(() => {})),
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
    // claim 직후 최신 상태를 다시 확인 — claim과 이 tick 사이에 사용자가
    // 취소를 요청했을 수 있다(요청서 취소 요구사항, 인코딩이 이미 진행 중인
    // 프로세스를 강제 종료하는 기능까지는 이번 phase 범위 밖 — 정직하게
    // "인코딩 시작 전" 취소만 확실히 보장한다).
    const fresh = getRenderJobById(job.id);
    if (fresh?.cancelRequested) {
      markRenderJobCancelled(job.id);
      insertRenderLog(job.id, 'info', '인코딩 시작 전 취소 요청이 확인되어 렌더를 중단했습니다');
      continue;
    }
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
