import fs from 'fs';
import path from 'path';

const PRODUCTS_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/products'
  : path.join(process.cwd(), 'data/uploads/products');
const DOCUMENTS_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/documents'
  : path.join(process.cwd(), 'data/uploads/documents');

// 제품 사진(기존 등록된 제품)이나 문서 첨부 사진의 URL을 로컬 파일 경로로 변환한다.
// PDF(react-pdf)·Excel(exceljs) 임베딩은 네트워크 fetch 대신 서버 로컬 파일을 직접 읽어야 하기 때문.
export function resolveItemImagePath(url: string | undefined | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // 외부 호스팅(Cloudinary 등) 절대 URL은 그대로 반환
  const productMatch = url.match(/\/api\/products\/([^/]+)\/images\/([^/?]+)/);
  if (productMatch) {
    const full = path.join(PRODUCTS_BASE, productMatch[1], productMatch[2]);
    return fs.existsSync(full) ? full : null;
  }
  const docMatch = url.match(/\/api\/documents\/([^/]+)\/files\/([^/]+)\/([^/?]+)/);
  if (docMatch) {
    const full = path.join(DOCUMENTS_BASE, docMatch[1], docMatch[2], docMatch[3]);
    return fs.existsSync(full) ? full : null;
  }
  return null;
}
