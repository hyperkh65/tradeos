import { NextRequest, NextResponse } from 'next/server';
import { nasUpload, buildNasPath } from '@/lib/storage/nas';
import { queueBackup } from '@/lib/storage/backup';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const relatedType = (formData.get('relatedType') as string) || 'general';
  const relatedId = (formData.get('relatedId') as string) || '';

  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const remotePath = buildNasPath(
    relatedType as Parameters<typeof buildNasPath>[0],
    relatedId,
    file.name
  );

  const result = await nasUpload(remotePath, buffer, file.type);

  if (!result.success) {
    return NextResponse.json({ error: '파일 저장에 실패했습니다. NAS 연결을 확인하세요.' }, { status: 500 });
  }

  // Queue cloud backup
  const backupJobId = queueBackup(result.path!);

  return NextResponse.json({
    success: true,
    path: result.path,
    backupJobId,
    message: '파일이 저장되었습니다.',
  });
}
