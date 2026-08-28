import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getAISettings, updateAISettings } from '@/lib/ai/db';
import { isAIEnabled } from '@/lib/ai/enabled';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const s = getAISettings();
  return NextResponse.json({
    data: {
      enabled: s.enabled,
      effectiveEnabled: isAIEnabled(),
      serverForcedDisabled: process.env.AI_ENABLED === 'false',
      defaultChatProviderId: s.defaultChatProviderId,
      defaultEmbeddingProviderId: s.defaultEmbeddingProviderId,
      rateLimitPerUserPerHour: s.rateLimitPerUserPerHour,
      searchTopK: s.searchTopK,
      qdrantUrl: s.qdrantUrl,
      hasQdrantApiKey: !!s.qdrantApiKey,
      qdrantCollection: s.qdrantCollection,
      updatedAt: s.updatedAt,
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json();
  const updated = updateAISettings({
    enabled: body.enabled, defaultChatProviderId: body.defaultChatProviderId,
    defaultEmbeddingProviderId: body.defaultEmbeddingProviderId,
    rateLimitPerUserPerHour: body.rateLimitPerUserPerHour, searchTopK: body.searchTopK,
    qdrantUrl: body.qdrantUrl, qdrantApiKey: body.qdrantApiKey, qdrantCollection: body.qdrantCollection,
    updatedBy: user.id,
  });
  return NextResponse.json({ data: { ...updated, qdrantApiKey: undefined, hasQdrantApiKey: !!updated.qdrantApiKey } });
}
