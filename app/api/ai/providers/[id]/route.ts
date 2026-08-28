import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getProvider, updateProvider, deleteProvider } from '@/lib/ai/db';
import { toPublic } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  if (!getProvider(id)) return NextResponse.json({ error: '존재하지 않는 provider입니다.' }, { status: 404 });

  const body = await req.json();
  const updated = updateProvider(id, {
    name: body.name, providerType: body.providerType, priority: body.priority, enabled: body.enabled,
    accountId: body.accountId, apiToken: body.apiToken, clearApiToken: body.clearApiToken,
    baseUrl: body.baseUrl, chatModel: body.chatModel, embeddingModel: body.embeddingModel,
    supportsChat: body.supportsChat, supportsEmbedding: body.supportsEmbedding,
  });
  return NextResponse.json({ data: updated ? toPublic(updated) : null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  if (!getProvider(id)) return NextResponse.json({ error: '존재하지 않는 provider입니다.' }, { status: 404 });
  deleteProvider(id);
  return NextResponse.json({ ok: true });
}
