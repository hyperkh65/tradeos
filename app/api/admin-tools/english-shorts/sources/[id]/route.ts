import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getSourceById, softDeleteSource, countProjectReferences } from '@/lib/admin-tools/english-shorts/db';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const source = getSourceById(id);
  if (!source || source.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // 요청서 84번 — 공유 라이브러리라 다른 프로젝트가 참조 중이면 경고와 함께 개수를
  // 알려준다(그래도 soft-delete는 허용 — 파일 자체는 남아있고 참조가 깨지지 않음,
  // 실제 NAS 파일 삭제는 이 단계에서 하지 않는다).
  const refCount = countProjectReferences(id);

  const ok = softDeleteSource(id, user.id);
  if (!ok) return NextResponse.json({ error: '삭제 실패' }, { status: 500 });

  writeEnglishShortsAuditLog({ sourceId: id, userId: user.id, userName: user.name, action: 'SOURCE_REMOVED', before: { referencedByProjects: refCount }, req });

  return NextResponse.json({ ok: true, referencedByProjects: refCount });
}
