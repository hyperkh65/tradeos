import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getConversation, listMessages } from '@/lib/ai/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation || conversation.userId !== user.id) {
    return NextResponse.json({ error: '존재하지 않거나 접근할 수 없는 대화입니다.' }, { status: 404 });
  }
  return NextResponse.json({ data: listMessages(id, 100) });
}
