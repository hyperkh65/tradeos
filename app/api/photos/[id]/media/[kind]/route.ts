import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPhotoById, getDerivative, canViewPhotoWithShares, type DerivativeKind } from '@/lib/photos/db';
import { downloadPhotoFile } from '@/lib/photos/storage';
import { PHOTO_PERMISSIONS, isPhotoAdmin } from '@/lib/photos/permissions';
import { writePhotoAuditLog } from '@/lib/photos/audit';

const DERIVATIVE_KINDS: DerivativeKind[] = ['thumb_small', 'thumb_medium', 'preview_large', 'watermarked'];

/** 사진 원본/썸네일/프리뷰를 인증·권한 확인 후에만 스트리밍한다(요청서 47/88번) —
 * NAS 경로를 직접 노출하지 않고 항상 이 백엔드 라우트를 거친다. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const { id, kind } = await params;
  const photo = getPhotoById(id);
  if (!photo || photo.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ownerId = photo.uploadedBy;
  if (!canViewPhotoWithShares(user, photo)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  let storedPath: string;
  let contentType: string;
  let disposition: 'inline' | 'attachment';

  if (kind === 'original') {
    if (!isPhotoAdmin(user) && ownerId !== user.id) {
      // 원본 다운로드는 별도 권한(PHOTO_DOWNLOAD_ORIGINAL) — Phase 13 관리자 설정에서
      // 정책화하기 전까지는 업로더/관리자만 허용(보수적 기본값).
      return NextResponse.json({ error: `원본 다운로드 권한이 없습니다 (${PHOTO_PERMISSIONS.DOWNLOAD_ORIGINAL})` }, { status: 403 });
    }
    storedPath = photo.storedPath;
    contentType = photo.mimeType;
    disposition = 'attachment';
  } else if (DERIVATIVE_KINDS.includes(kind as DerivativeKind)) {
    const derivative = getDerivative(id, kind as DerivativeKind);
    if (!derivative) {
      return NextResponse.json({ error: photo.status === 'processing' ? '미리보기 생성 중입니다' : '미리보기를 사용할 수 없습니다' }, { status: 404 });
    }
    storedPath = derivative.storedPath;
    contentType = 'image/webp';
    disposition = 'inline';
  } else {
    return NextResponse.json({ error: '알 수 없는 종류입니다' }, { status: 400 });
  }

  const buf = await downloadPhotoFile(storedPath);
  if (!buf) return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });

  if (kind === 'original') {
    writePhotoAuditLog({ photoId: id, userId: user.id, userName: user.name, action: 'DOWNLOAD', req });
  }

  const encodedName = encodeURIComponent(photo.originalFileName);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': disposition === 'inline' ? 'private, max-age=3600' : 'private, no-store',
    },
  });
}
