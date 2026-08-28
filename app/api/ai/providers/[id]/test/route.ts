import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getProvider, recordProviderSuccess, recordProviderFailure } from '@/lib/ai/db';
import { createProviderInstance } from '@/lib/ai/providers/factory';
import { AIProviderError } from '@/lib/ai/types';

/** 관리자가 "연결 테스트" 버튼을 눌렀을 때만 실제 호출한다(자동 폴링 없음 —
 * 불필요하게 무료 API 할당량을 소모하지 않기 위함). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) return NextResponse.json({ error: '존재하지 않는 provider입니다.' }, { status: 404 });

  try {
    const instance = createProviderInstance(provider);
    const result = await instance.healthCheck();
    if (result.ok) {
      recordProviderSuccess(id);
      return NextResponse.json({ ok: true, message: result.message });
    }
    recordProviderFailure(id, { retryable: result.retryable ?? false, message: result.message });
    return NextResponse.json({ ok: false, message: result.message }, { status: 200 });
  } catch (e) {
    const err = e instanceof AIProviderError ? e : new AIProviderError((e as Error).message, { retryable: false });
    recordProviderFailure(id, { retryable: err.retryable, message: err.message });
    return NextResponse.json({ ok: false, message: err.message }, { status: 200 });
  }
}
