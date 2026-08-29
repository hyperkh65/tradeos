import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { detectExternalDrives, getSelectedBackupDriveUuid, setSelectedBackupDriveUuid, resolveSelectedBackupDriveMountPoint } from '@/lib/backup/drive-detect';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  return NextResponse.json({
    data: {
      detected: detectExternalDrives(),
      selectedUuid: getSelectedBackupDriveUuid(),
      selectedMountPoint: resolveSelectedBackupDriveMountPoint(),
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const uuid = String(body.uuid || '');
  if (!uuid) return NextResponse.json({ error: 'uuid가 필요합니다.' }, { status: 400 });
  setSelectedBackupDriveUuid(uuid);
  return NextResponse.json({ data: { selectedUuid: uuid, selectedMountPoint: resolveSelectedBackupDriveMountPoint() } });
}
