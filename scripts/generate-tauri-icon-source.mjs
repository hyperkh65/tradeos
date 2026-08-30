// Tauri 데스크톱 앱 아이콘의 1024x1024 소스 PNG를 생성한다.
// scripts/generate-pwa-icons.mjs와 동일한 브랜드 스타일(YnK 모노그램)을 재사용.
// 이 파일로 `npx tauri icon <output>`을 실행해 icns/ico 등 전체 세트를 만든다.
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tauri-icon-source.png');
const BRAND_BLUE = '#1d4ed8';
const SIZE = 1024;
const fontSize = Math.round(SIZE * 0.38);

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="${Math.round(SIZE * 0.18)}" fill="${BRAND_BLUE}"/>
  <text x="50%" y="53%" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">YnK</text>
</svg>`;

await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toFile(OUT);
console.log('wrote', OUT);
