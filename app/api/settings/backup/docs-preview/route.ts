import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { generateManifest } from '@/lib/backup/manifest';
import { auditAttachments } from '@/lib/backup/attachments';
import { generateAllDocs } from '@/lib/backup/docs';

/** 실제 백업 파일을 만들지 않고도 "지금 백업하면 어떤 문서가 들어갈지" 관리자
 * 화면(시스템구조 탭)에서 바로 볼 수 있게 한다. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const manifest = generateManifest('preview');
  const audit = auditAttachments();
  const docs = generateAllDocs(manifest, audit);
  return NextResponse.json({ data: { manifest, docs } });
}
