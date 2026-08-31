/**
 * 확장자만 믿지 않고 파일 시그니처(매직 바이트)로 실제 이미지 포맷을 확인한다
 * (요청서 48번 — 악성 실행파일을 이미지로 위장한 업로드 방지).
 */
export type DetectedImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'bmp' | null;

export function detectImageFormat(buf: Buffer): DetectedImageFormat {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  // HEIC/HEIF: ISO BMFF 'ftyp' box, brand at offset 8-12 (major_brand)
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return null;
}

const FORMAT_TO_MIME: Record<Exclude<DetectedImageFormat, null>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  bmp: 'image/bmp',
};

export function formatToMime(fmt: Exclude<DetectedImageFormat, null>): string {
  return FORMAT_TO_MIME[fmt];
}
