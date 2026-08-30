// PWA 아이콘 세트를 브랜드 텍스트(YnK)로 생성한다. 실제 로고 이미지 자산이 아직 없어서
// (lib/brand.ts의 logoText만 존재) sharp로 SVG를 래스터라이즈한다. 나중에 실제 로고가
// 생기면 이 스크립트의 SVG 부분만 교체하고 다시 실행하면 됨.
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BRAND_BLUE = '#1d4ed8'; // app/globals.css --primary(oklch)에 대응하는 근사 hex

function plainSvg(size) {
  const fontSize = Math.round(size * 0.42);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BRAND_BLUE}"/>
    <text x="50%" y="53%" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">YnK</text>
  </svg>`;
}

// 마스커블 아이콘: 안전영역 확보를 위해 텍스트를 더 작게 배치(원형/둥근사각형으로 잘려도 안전).
function maskableSvg(size) {
  const fontSize = Math.round(size * 0.30);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BRAND_BLUE}"/>
    <text x="50%" y="53%" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">YnK</text>
  </svg>`;
}

const targets = [
  { name: 'icon-192.png', svg: plainSvg(192), size: 192 },
  { name: 'icon-512.png', svg: plainSvg(512), size: 512 },
  { name: 'icon-maskable-192.png', svg: maskableSvg(192), size: 192 },
  { name: 'icon-maskable-512.png', svg: maskableSvg(512), size: 512 },
  { name: 'apple-touch-icon.png', svg: plainSvg(180), size: 180 },
  { name: 'favicon-32.png', svg: plainSvg(32), size: 32 },
  { name: 'favicon-16.png', svg: plainSvg(16), size: 16 },
];

for (const t of targets) {
  await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toFile(path.join(OUT, t.name));
  console.log('wrote', t.name);
}
