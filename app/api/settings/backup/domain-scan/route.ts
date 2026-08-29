import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { scanForHardcodedDomain } from '@/lib/backup/domain-scan';
import { getAppDomain } from '@/lib/config/domain';

/** recovery/change-domain.sh도 앱이 기동된 뒤 이 API를 호출해서 "구 도메인 잔존
 * 0건"을 확인한다(스크립트가 자체 TS 런타임을 필요로 하지 않도록 — production은
 * standalone 빌드라 tsx 등 dev 의존성이 없음). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const domain = String(body.domain || getAppDomain());
  const hits = scanForHardcodedDomain(domain);

  return NextResponse.json({ data: { domain, hitCount: hits.length, hits: hits.slice(0, 100) } });
}
