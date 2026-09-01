import fs from 'node:fs/promises';
import path from 'node:path';
import { nasExists } from '@/lib/storage/nas';
import { buildFontStagingPath, uploadEnglishShortsFile } from './storage';

/** ASS 자막 큐(하나의 화면 표시 구간). */
export interface AssCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface AssStyleOptions {
  fontName?: string;
  fontSizePt?: number;
  primaryColorHex?: string;
  outlineColorHex?: string;
  /** 'bottom' | 'top' | 'center' — ASS numpad alignment(2/8/5)로 변환 */
  position?: 'bottom' | 'top' | 'center';
  marginVPx?: number;
  boxBackground?: boolean;
  cardColorHex?: string;
  cardOpacity?: number;
  playResX?: number;
  playResY?: number;
}

/**
 * ASS Dialogue Text 필드는 지정된 콤마 개수 이후는 전부 리터럴 텍스트라
 * 아포스트로피/따옴표/쉼표/콜론/한글이 자연히 안전하다. 실제로 특수 취급되는
 * 문자는 `{`/`}`(오버라이드 태그 구분자)와 백슬래시(`\N` 등 제어 시퀀스
 * 시작 문자)뿐이다. ASS 자체에는 이 문자들을 리터럴로 표기하는 공식 이스케이프
 * 문법이 없으므로(libass가 항상 `{...}`를 오버라이드로 해석), 전각(fullwidth)
 * 유니코드 문자로 치환해 시각적으로는 거의 동일하면서 파서에는 안전하게 만든다.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '＼')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/\r\n|\r|\n/g, '\\N');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 초 단위 실수 → ASS 시간 형식 H:MM:SS.CC(centisecond) */
export function secToAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

/** #RRGGBB(+선택적 0~1 opacity) → ASS &HAABBGGRR. ASS 알파는 반전(00=불투명,FF=완전투명). */
export function hexToAssColor(hex: string, opacity = 1): string {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255).toString(16).padStart(2, '0');
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function positionToAlignment(position: AssStyleOptions['position']): number {
  if (position === 'top') return 8;
  if (position === 'center') return 5;
  return 2; // bottom
}

/** 실제 렌더에 쓸 ASS 파일 전체 내용을 만든다. cues는 시작초 순서를 요구하지 않음(그대로 순서대로 씀). */
export function buildAssFile(cues: AssCue[], opts: AssStyleOptions = {}): string {
  const fontName = opts.fontName ?? 'Noto Sans KR';
  const fontSize = opts.fontSizePt ?? 44;
  const primary = hexToAssColor(opts.primaryColorHex ?? '#FFFFFF', 1);
  const outline = hexToAssColor(opts.outlineColorHex ?? '#000000', 1);
  const alignment = positionToAlignment(opts.position);
  const marginV = opts.marginVPx ?? 80;
  const playResX = opts.playResX ?? 1080;
  const playResY = opts.playResY ?? 1920;
  const back = opts.boxBackground
    ? hexToAssColor(opts.cardColorHex ?? '#000000', opts.cardOpacity ?? 0.5)
    : '&H00000000';
  const borderStyle = opts.boxBackground ? 3 : 1; // 3 = opaque box background

  const header = [
    '[Script Info]',
    'Title: English Shorts Studio',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${fontSize},${primary},&H000000FF,${outline},${back},-1,0,0,0,100,100,0,0,${borderStyle},2,1,${alignment},20,20,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events = cues
    .map(c => `Dialogue: 0,${secToAssTime(c.startSec)},${secToAssTime(c.endSec)},Default,,0,0,0,,${escapeAssText(c.text)}`)
    .join('\n');

  return `${header}\n${events}\n`;
}

/** 번들 폰트(public/fonts/subtitles) → 렌더 워커(FFmpeg 컨테이너)와 공유하는
 * bind mount 경로로 1회 시딩. 이미 있으면 아무것도 하지 않는다(멱등, 워커
 * 시작 시마다 호출해도 안전). */
export async function ensureSubtitleFontDeployed(): Promise<string> {
  const stagedPath = buildFontStagingPath();
  const alreadyThere = await nasExists(stagedPath);
  if (!alreadyThere) {
    const sourcePath = path.join(process.cwd(), 'public', 'fonts', 'subtitles', 'NotoSansKR-Bold.otf');
    const buffer = await fs.readFile(sourcePath);
    await uploadEnglishShortsFile(stagedPath, buffer, 'font/otf');
  }
  return stagedPath;
}
