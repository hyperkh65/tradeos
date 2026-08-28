import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getQdrantConfig } from '@/lib/ai/qdrant-config';
import { qdrantSearch } from '@/lib/ai/vectorstore/qdrant';
import { embedTexts } from '@/lib/ai/embeddings';

/** "AI 지식 테스트" — LLM을 거치지 않고 Qdrant가 실제로 무엇을 찾아내는지
 * 원본 그대로(score/payload) 보여주는 admin 전용 진단 도구. 일반 사용자는
 * Qdrant/임베딩 같은 용어를 볼 일이 없어야 하므로 admin 전용으로 제한한다. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q');
  if (!q?.trim()) return NextResponse.json({ error: 'q 쿼리 파라미터가 필요합니다.' }, { status: 400 });

  const cfg = getQdrantConfig();
  if (!cfg) return NextResponse.json({ error: 'Qdrant가 설정되지 않았습니다.' }, { status: 400 });

  try {
    const embedResult = await embedTexts([q]);
    const hits = await qdrantSearch(cfg, embedResult.vectors[0], { limit: 20 });
    return NextResponse.json({
      data: {
        embeddingModel: embedResult.model, dimensions: embedResult.dimensions,
        hits: hits.map(h => ({ id: h.id, score: h.score, payload: h.payload })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
