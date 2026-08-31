import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { detectImageFormat, formatToMime } from '@/lib/photos/magic-bytes';
import { extractExif } from '@/lib/photos/exif';
import { sha256 } from '@/lib/photos/hash';
import { buildOriginalPath, uploadPhotoFile } from '@/lib/photos/storage';
import { insertPhoto, findPhotoByHash, enqueuePhotoJob, getPhotoById } from '@/lib/photos/db';
import { writePhotoAuditLog } from '@/lib/photos/audit';
import { getPhotoSettings } from '@/lib/photos/settings';
import { newId } from '@/lib/db/sqlite';
import sharp from 'sharp';

export const maxDuration = 300;

type FileResult =
  | { fileName: string; status: 'ok'; photoId: string }
  | { fileName: string; status: 'duplicate'; existingPhotoId: string }
  | { fileName: string; status: 'duplicate_reused'; existingPhotoId: string }
  | { fileName: string; status: 'error'; error: string };

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  if (files.length === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

  const folderId = (formData.get('folderId') as string | null) || null;
  const overrideHashesRaw = formData.get('overrideHashes') as string | null;
  let overrideHashes: string[] = [];
  try { overrideHashes = overrideHashesRaw ? JSON.parse(overrideHashesRaw) : []; } catch { /* ignore malformed */ }

  const settings = getPhotoSettings();
  if (files.length > settings.maxFilesPerBatch) {
    return NextResponse.json({ error: `한 번에 최대 ${settings.maxFilesPerBatch}개까지 업로드할 수 있습니다` }, { status: 400 });
  }

  const results: FileResult[] = [];

  // 요청서 7번 — 파일 하나가 실패해도 나머지는 계속 처리한다(전체 중단 금지).
  for (const file of files) {
    try {
      if (file.size > settings.maxUploadSizeMb * 1024 * 1024) {
        results.push({ fileName: file.name, status: 'error', error: `파일이 너무 큽니다 (최대 ${settings.maxUploadSizeMb}MB)` });
        continue;
      }

      const buf = Buffer.from(await file.arrayBuffer());

      // 확장자만 믿지 않고 매직 바이트로 실제 포맷 확인(요청서 48번).
      const fmt = detectImageFormat(buf);
      if (!fmt) {
        results.push({ fileName: file.name, status: 'error', error: '지원하지 않는 이미지 형식이거나 손상된 파일입니다' });
        continue;
      }
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      if (!settings.allowedExtensions.includes(ext) && !settings.allowedExtensions.includes(fmt)) {
        results.push({ fileName: file.name, status: 'error', error: `허용되지 않는 확장자입니다 (${fmt})` });
        continue;
      }

      const hash = sha256(buf);
      const existing = findPhotoByHash(hash);
      if (existing && settings.duplicatePolicy !== 'always_new' && !overrideHashes.includes(hash)) {
        if (settings.duplicatePolicy === 'reuse') {
          results.push({ fileName: file.name, status: 'duplicate_reused', existingPhotoId: existing.id });
        } else {
          // 'ask' — 삽입하지 않고 클라이언트가 선택하게 한다(기존 사진 사용/그래도 새로
          // 업로드/취소). 새로 업로드를 원하면 overrideHashes에 이 hash를 담아 재요청.
          results.push({ fileName: file.name, status: 'duplicate', existingPhotoId: existing.id });
        }
        continue;
      }

      // HEIC는 sharp/libvips가 실제로 디코딩 가능한지 여기서 바로 확인 —
      // 안 되면 원본은 그대로 저장하고 폭 정보만 비운 채 계속 진행(요청서 49번:
      // 조용히 실패시키지 않고, 나중에 썸네일 워커가 실패 상태를 명확히 남긴다).
      let width: number | null = null;
      let height: number | null = null;
      try {
        const meta = await sharp(buf, { failOn: 'none' }).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch { /* 치수 파악 실패해도 원본 저장은 계속 — 워커가 재시도 */ }

      const exif = await extractExif(buf);

      // id를 먼저 발급해 NAS 저장 경로(photos/original/…/{id}.ext)와 photos.id를
      // 반드시 일치시킨다 — 따로 생성하면 stored_path가 존재하지 않는 id를 가리키게 됨.
      const photoId = newId();
      const path = buildOriginalPath(photoId, file.name);
      const uploadRes = await uploadPhotoFile(path, buf, formatToMime(fmt));
      if (!uploadRes.success || !uploadRes.path) {
        results.push({ fileName: file.name, status: 'error', error: `NAS 저장 실패: ${uploadRes.error || '알 수 없는 오류'}` });
        continue;
      }

      const photo = insertPhoto({
        folderId,
        originalFileName: file.name,
        storedPath: uploadRes.path,
        mimeType: formatToMime(fmt),
        extension: ext,
        fileSize: buf.length,
        width, height,
        hash,
        capturedAt: exif.capturedAt,
        cameraMake: exif.cameraMake,
        cameraModel: exif.cameraModel,
        orientation: exif.orientation,
        gpsLat: exif.gpsLat,
        gpsLng: exif.gpsLng,
        uploadedBy: user.id,
        uploadedByName: user.name,
      }, photoId);

      enqueuePhotoJob(photo.id);
      writePhotoAuditLog({ photoId: photo.id, userId: user.id, userName: user.name, action: 'UPLOAD', after: { fileName: file.name, folderId }, req });

      results.push({ fileName: file.name, status: 'ok', photoId: photo.id });
    } catch (e) {
      results.push({ fileName: file.name, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ results });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
  const photo = getPhotoById(id);
  if (!photo) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ photo });
}
