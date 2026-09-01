import sharp from 'sharp';
import { getDerivative, upsertDerivative } from '@/lib/photos/db';
import { downloadPhotoFile, uploadPhotoFile, buildDerivativePath } from '@/lib/photos/storage';

const WATERMARK_TEXT = 'YNK';

function watermarkSvg(width: number, height: number, text: string): Buffer {
  const fontSize = Math.max(28, Math.round(Math.min(width, height) / 8));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      transform="rotate(-30 ${width / 2} ${height / 2})"
      font-family="sans-serif" font-weight="700" font-size="${fontSize}"
      fill="rgba(255,255,255,0.32)" stroke="rgba(0,0,0,0.15)" stroke-width="1">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

/** 외부공유 워터마크(요청서 45번, "고정 텍스트") — preview_large 파생본 위에 대각선 반투명
 * 텍스트를 합성해 photo_derivatives(kind='watermarked')로 캐시한다. 원본은 절대 건드리지
 * 않고(요청서 원칙), 최초 요청 시 1회만 생성 후 재사용한다. */
export async function getOrCreateWatermarkedPreview(photoId: string): Promise<{ storedPath: string } | null> {
  const existing = getDerivative(photoId, 'watermarked');
  if (existing) return { storedPath: existing.storedPath };

  const source = getDerivative(photoId, 'preview_large');
  if (!source) return null;
  const buf = await downloadPhotoFile(source.storedPath);
  if (!buf) return null;

  const meta = await sharp(buf).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;
  const overlay = watermarkSvg(width, height, WATERMARK_TEXT);

  const watermarked = await sharp(buf).composite([{ input: overlay }]).webp({ quality: 82 }).toBuffer();
  const path = buildDerivativePath(photoId, 'watermarked');
  const uploadResult = await uploadPhotoFile(path, watermarked, 'image/webp');
  if (!uploadResult.success || !uploadResult.path) return null;

  upsertDerivative(photoId, 'watermarked', uploadResult.path, width, height, 'webp', watermarked.length);
  return { storedPath: uploadResult.path };
}
