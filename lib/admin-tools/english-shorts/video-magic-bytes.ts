/**
 * 확장자만 믿지 않고 파일 시그니처(매직 바이트)로 실제 비디오 포맷을 확인한다
 * (lib/photos/magic-bytes.ts와 동일 원칙 — 요청서 48번과 동일한 이유로
 * 위장 업로드를 차단한다).
 */
export type DetectedVideoFormat = 'mp4' | 'mov' | 'webm' | null;

// ISO BMFF(mp4/mov/m4v)가 쓰는 'ftyp' 박스의 major_brand 값들
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'mp4b', 'avc1', 'M4V ', 'M4A ', '3gp5', 'dash']);
const MOV_BRANDS = new Set(['qt  ']);

export function detectVideoFormat(buf: Buffer): DetectedVideoFormat {
  if (buf.length < 12) return null;

  // ISO BMFF: 4바이트 박스크기 + 'ftyp' + major_brand(4바이트)
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (MOV_BRANDS.has(brand)) return 'mov';
    if (MP4_BRANDS.has(brand)) return 'mp4';
    // 알려지지 않은 brand라도 ftyp 박스 자체는 ISO BMFF 컨테이너라는 확실한 신호라
    // mp4로 관대하게 처리(향후 ffprobe가 실제 코덱을 다시 한번 검증함, Phase 4).
    return 'mp4';
  }
  // ftyp 없는 구버전 QuickTime: 4바이트 크기 뒤에 moov/free/wide/mdat/skip 등 atom
  const earlyAtom = buf.toString('ascii', 4, 8);
  if (['moov', 'free', 'wide', 'mdat', 'skip', 'pnot'].includes(earlyAtom)) return 'mov';

  // WebM/Matroska EBML 헤더
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';

  return null;
}

const FORMAT_TO_MIME: Record<Exclude<DetectedVideoFormat, null>, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export function videoFormatToMime(fmt: Exclude<DetectedVideoFormat, null>): string {
  return FORMAT_TO_MIME[fmt];
}
