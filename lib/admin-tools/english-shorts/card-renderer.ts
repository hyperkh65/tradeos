import sharp from 'sharp';

/**
 * ffmpeg drawbox는 사각형 채우기/테두리만 가능하고 둥근 모서리·그림자를
 * 그릴 수 없다 — 그래서 실제 카드 그래픽은 SVG로 그려 sharp(이미 이 코드베이스
 * 다른 곳에서 이미지 편집에 쓰는 라이브러리, libvips 기반이라 SVG 래스터화도
 * 지원)로 PNG 래스터화한 뒤 ffmpeg에서는 overlay로 얹기만 한다. 색상/크기가
 * 템플릿 설정마다 달라질 수 있어 고정 에셋 파일이 아니라 렌더마다 생성한다.
 */

export interface CardImageOptions {
  widthPx: number;
  heightPx: number;
  colorHex: string;
  opacity?: number;
  borderColorHex?: string;
  borderOpacity?: number;
  borderWidthPx?: number;
  cornerRadiusPx?: number;
  shadow?: boolean;
}

export interface CardImageResult {
  buffer: Buffer;
  /** SVG 캔버스가 그림자 여백만큼 카드보다 더 크게 그려지므로, 실제 카드의
   * 시각적 좌상단이 이 이미지 안에서 몇 px 안쪽에 있는지 — overlay 배치 시
   * 의도한 카드 위치에서 이 값만큼 빼서 이미지의 topPx/xOffsetPx를 정해야 한다. */
  pad: number;
}

export async function renderCardPng(opts: CardImageOptions): Promise<CardImageResult> {
  const {
    widthPx, heightPx, colorHex, opacity = 1,
    borderColorHex, borderOpacity = 1, borderWidthPx = 0,
    cornerRadiusPx = 24, shadow = true,
  } = opts;
  const pad = shadow ? 28 : Math.max(4, borderWidthPx + 2);
  const svgW = widthPx + pad * 2;
  const svgH = heightPx + pad * 2;

  const shadowRect = shadow
    ? `<rect x="${pad}" y="${pad + 8}" width="${widthPx}" height="${heightPx}" rx="${cornerRadiusPx}" fill="#000000" opacity="0.4" filter="url(#blur)"/>`
    : '';
  const borderAttr = borderColorHex && borderWidthPx > 0
    ? ` stroke="${borderColorHex}" stroke-opacity="${borderOpacity}" stroke-width="${borderWidthPx}"`
    : '';

  const svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter></defs>
    ${shadowRect}
    <rect x="${pad}" y="${pad}" width="${widthPx}" height="${heightPx}" rx="${cornerRadiusPx}" fill="${colorHex}" fill-opacity="${opacity}"${borderAttr}/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, pad };
}

export interface GradientBarOptions {
  widthPx: number;
  heightPx: number;
  colorStartHex: string;
  colorEndHex: string;
}

export async function renderGradientBarPng(opts: GradientBarOptions): Promise<Buffer> {
  const { widthPx, heightPx, colorStartHex, colorEndHex } = opts;
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colorStartHex}"/>
      <stop offset="100%" stop-color="${colorEndHex}"/>
    </linearGradient></defs>
    <rect width="${widthPx}" height="${heightPx}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 레터박스 영상의 네 모서리를 배경색으로 덮어써서 둥근 모서리처럼 보이게
 * 하는 마스크(실제로 영상 픽셀을 자르지 않음 — 중앙은 완전 투명, 모서리
 * 삼각형 영역만 불투명 배경색). 영상 위에 그대로 overlay하면 된다. */
export async function renderRoundedCornerMaskPng(widthPx: number, heightPx: number, cornerRadiusPx: number, bgColorHex: string): Promise<Buffer> {
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg">
    <defs><mask id="m">
      <rect width="${widthPx}" height="${heightPx}" fill="white"/>
      <rect x="0" y="0" width="${widthPx}" height="${heightPx}" rx="${cornerRadiusPx}" fill="black"/>
    </mask></defs>
    <rect width="${widthPx}" height="${heightPx}" fill="${bgColorHex}" mask="url(#m)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
