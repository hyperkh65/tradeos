import { NextResponse } from 'next/server';
import { getAdminToolBySlug } from '@/lib/admin-tools/registry';

/** admin_tools 레지스트리의 enabled/maintenanceMode를 실제로 강제한다 —
 * /admin/tools 카드에서 비활성/점검중으로 "보이기만" 하는 게 아니라, 실제로
 * 새 작업을 시작하는 API(프로젝트 생성/소스 업로드/렌더 등록)가 503을
 * 반환하게 한다. 이미 만들어진 데이터를 조회하는 것까지 막지는 않는다. */
export async function requireEnglishShortsToolActive(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const tool = getAdminToolBySlug('english-shorts');
  if (!tool || !tool.enabled) {
    return { ok: false, response: NextResponse.json({ error: '이 도구는 현재 비활성화되어 있습니다.' }, { status: 503 }) };
  }
  if (tool.maintenanceMode) {
    return { ok: false, response: NextResponse.json({ error: '이 도구는 현재 점검 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 503 }) };
  }
  return { ok: true };
}
