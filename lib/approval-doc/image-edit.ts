import sharp from 'sharp';

/**
 * 이미지 자동 편집 — 자르기/회전/배경정리 등 순수 기하·픽셀 연산만 수행한다.
 *
 * 하드 제약(요청서 §8): 원본 제품의 형태·색상·부품·표시사항을 생성형 AI로 임의 변경하지
 * 않는다. 이 파일에는 어떤 생성형 모델 호출도 있어서는 안 되며, sharp가 제공하는 결정론적
 * 이미지 처리 함수(crop/rotate/resize/flatten 등)만 사용한다. 원본 파일은 호출부
 * (attachments 라우트)가 절대 덮어쓰지 않고, 이 함수들은 항상 새 버퍼를 반환한다.
 */

export interface CropRect { x: number; y: number; w: number; h: number } // 0~1 정규화 좌표

export async function rotateImage(input: Buffer, degrees: 0 | 90 | 180 | 270): Promise<Buffer> {
  if (degrees === 0) return input;
  return sharp(input).rotate(degrees).toBuffer();
}

export async function cropImage(input: Buffer, rect: CropRect): Promise<Buffer> {
  const img = sharp(input);
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) throw new Error('이미지 크기를 읽을 수 없습니다.');
  const left = Math.max(0, Math.round(rect.x * width));
  const top = Math.max(0, Math.round(rect.y * height));
  const w = Math.min(width - left, Math.round(rect.w * width));
  const h = Math.min(height - top, Math.round(rect.h * height));
  if (w <= 0 || h <= 0) throw new Error('잘라낼 영역이 올바르지 않습니다.');
  return sharp(input).extract({ left, top, width: w, height: h }).toBuffer();
}

/** 흰색/단색 배경을 투명하게 만드는 결정론적 처리(생성형 아님) — 모서리 픽셀 색상을
 * 기준으로 유사색을 투명 처리한다. 복잡한 배경에는 효과가 제한적일 수 있음을 화면에서
 * 안내해야 한다(요청서: 배경 제거는 "선택" 기능이지 항상 완벽함을 보장하지 않음). */
export async function removeSimpleBackground(input: Buffer, tolerance = 20): Promise<Buffer> {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4) return input;
  // 네 모서리 평균색을 배경색으로 추정
  const corners = [0, (width - 1) * channels, (height - 1) * width * channels, ((height - 1) * width + width - 1) * channels];
  let r = 0, g = 0, b = 0;
  for (const idx of corners) { r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; }
  r /= corners.length; g /= corners.length; b /= corners.length;

  for (let i = 0; i < data.length; i += channels) {
    const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < tolerance) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** 알파 채널 전체에 배율을 곱해 반투명하게 만든다 — 워터마크용 결정론적 픽셀 연산.
 * opacity는 0(완전 투명)~1(원본 그대로) 범위로 clamp한다. */
export async function applyOpacity(input: Buffer, opacity: number): Promise<Buffer> {
  const factor = Math.max(0, Math.min(1, opacity));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 3; i < data.length; i += channels) data[i] = Math.round(data[i] * factor);
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** 자르기를 먼저 적용해 crop 좌표가 항상 "회전되지 않은 원본" 기준이 되게 한다 — 화면에서
 * 사용자가 보는 원본 미리보기와 좌표계가 항상 일치해야 자르기 도구가 예측 가능하다. */
export async function applyImageEdits(input: Buffer, opts: { rotationDeg?: 0 | 90 | 180 | 270; crop?: CropRect; bgRemove?: boolean }): Promise<Buffer> {
  let buf = input;
  if (opts.crop) buf = await cropImage(buf, opts.crop);
  if (opts.rotationDeg) buf = await rotateImage(buf, opts.rotationDeg);
  if (opts.bgRemove) buf = await removeSimpleBackground(buf);
  return buf;
}
