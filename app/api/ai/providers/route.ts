import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createProvider, listProviders, type AIProviderRow } from '@/lib/ai/db';
import type { AIProviderType } from '@/lib/ai/types';

/** 목록 응답에서는 토큰 평문을 절대 내려보내지 않는다 — masked만 표시. */
function toPublic(p: AIProviderRow) {
  return {
    id: p.id, name: p.name, providerType: p.providerType, enabled: p.enabled, priority: p.priority,
    accountId: p.accountId, baseUrl: p.baseUrl, chatModel: p.chatModel, embeddingModel: p.embeddingModel,
    supportsChat: p.supportsChat, supportsEmbedding: p.supportsEmbedding,
    hasApiToken: !!p.apiToken,
    apiTokenMasked: p.apiToken ? `••••${p.apiToken.slice(-4)}` : null,
    status: p.status, lastSuccessAt: p.lastSuccessAt, lastFailureAt: p.lastFailureAt,
    failureCount: p.failureCount, cooldownUntil: p.cooldownUntil, lastError: p.lastError,
    dailyUsageEstimate: p.dailyUsageEstimate,
    createdByName: p.createdByName, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: listProviders().map(toPublic) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json() as {
    name?: string; providerType?: AIProviderType; priority?: number; enabled?: boolean;
    accountId?: string; apiToken?: string; baseUrl?: string; chatModel?: string; embeddingModel?: string;
    supportsChat?: boolean; supportsEmbedding?: boolean;
  };
  if (!body.name?.trim()) return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 });
  const validTypes: AIProviderType[] = ['cloudflare', 'gemini', 'anthropic', 'openai', 'ollama', 'openai_compatible'];
  if (!body.providerType || !validTypes.includes(body.providerType)) {
    return NextResponse.json({ error: '유효하지 않은 provider 유형입니다.' }, { status: 400 });
  }

  const created = createProvider({
    name: body.name.trim(), providerType: body.providerType, priority: body.priority, enabled: body.enabled,
    accountId: body.accountId, apiToken: body.apiToken, baseUrl: body.baseUrl,
    chatModel: body.chatModel, embeddingModel: body.embeddingModel,
    supportsChat: body.supportsChat, supportsEmbedding: body.supportsEmbedding,
    createdBy: user.id, createdByName: user.name,
  });
  return NextResponse.json({ data: toPublic(created) }, { status: 201 });
}

export { toPublic };
