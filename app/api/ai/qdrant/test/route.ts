import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';
import { qdrantHealthCheck, qdrantGetCollectionInfo } from '@/lib/ai/vectorstore/qdrant';

/** 관리자가 명시적으로 누를 때만 실제로 호출한다(자동 폴링 없음). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const cfg = getQdrantConfig();
  if (!cfg) return NextResponse.json({ ok: false, message: 'Qdrant URL이 설정되지 않았습니다.' });

  const health = await qdrantHealthCheck(cfg);
  if (!health.ok) return NextResponse.json({ ok: false, message: health.message });

  try {
    const info = await qdrantGetCollectionInfo(cfg);
    return NextResponse.json({
      ok: true,
      message: info.exists
        ? `연결됨 — 컬렉션 "${cfg.collection}" (${info.pointsCount}개 벡터, 상태: ${info.status})`
        : `연결됨 — 컬렉션 "${cfg.collection}"은 아직 생성되지 않았습니다(첫 인덱싱 시 자동 생성).`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message });
  }
}
