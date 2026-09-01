import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPhotoSettings, updatePhotoSettings, type PhotoSettings } from '@/lib/photos/settings';
import { canManageSettings } from '@/lib/photos/permissions';

/** 조회는 모든 로그인 사용자에게 허용한다 — 업로드 화면의 최대용량 안내, 외부공유
 * 모달의 기본값/최대기간 표시 등 클라이언트가 정책을 알아야 하는 곳이 많다.
 * 변경은 관리자만(요청서 46번). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  return NextResponse.json({ settings: getPhotoSettings() });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!canManageSettings(user)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<PhotoSettings> = {};
  const num = (k: keyof PhotoSettings) => { if (typeof body[k] === 'number' && body[k] > 0) (patch as Record<string, unknown>)[k] = body[k]; };
  const bool = (k: keyof PhotoSettings) => { if (typeof body[k] === 'boolean') (patch as Record<string, unknown>)[k] = body[k]; };

  num('maxUploadSizeMb'); num('maxFilesPerBatch'); num('trashRetentionDays'); num('maxExternalShareDays');
  num('thumbSmallPx'); num('thumbMediumPx'); num('previewLargePx');
  bool('allowExternalShare'); bool('allowPasswordlessExternalShare'); bool('defaultAllowOriginalDownload');
  bool('defaultWatermark'); bool('showExifGps');
  if (Array.isArray(body.allowedExtensions) && body.allowedExtensions.every((s: unknown) => typeof s === 'string')) {
    patch.allowedExtensions = body.allowedExtensions.map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  }
  if (body.duplicatePolicy === 'ask' || body.duplicatePolicy === 'reuse' || body.duplicatePolicy === 'always_new') {
    patch.duplicatePolicy = body.duplicatePolicy;
  }

  updatePhotoSettings(patch, user.id);
  return NextResponse.json({ settings: getPhotoSettings() });
}
