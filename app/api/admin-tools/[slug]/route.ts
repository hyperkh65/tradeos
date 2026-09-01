import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsManager } from '@/lib/admin-tools/auth';
import { getAdminToolBySlug, updateAdminTool } from '@/lib/admin-tools/registry';
import { writeAdminToolsAuditLog } from '@/lib/admin-tools/audit';

/** 도구 활성화/점검모드 토글 — MANAGE 권한 필요(지금은 ADMIN_TOOLS_VIEW/USE와
 * 동일하게 role==='admin'으로 판정되지만, 이름을 분리해 향후 세분화된 권한이
 * 생겨도 이 코드를 바꿀 필요가 없게 한다). 실제로 무엇이 바뀌었는지에 따라
 * 정확한 audit action을 남긴다(뭉뚱그려 하나로 남기지 않음). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminToolsManager();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { slug } = await params;

  const existing = getAdminToolBySlug(slug);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: { enabled?: boolean; maintenanceMode?: boolean } = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.maintenanceMode === 'boolean') patch.maintenanceMode = body.maintenanceMode;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 값이 없습니다' }, { status: 400 });

  const updated = updateAdminTool(slug, patch);

  if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
    writeAdminToolsAuditLog({
      toolSlug: slug, userId: user.id, userName: user.name,
      action: patch.enabled ? 'TOOL_ENABLED' : 'TOOL_DISABLED',
      before: { enabled: existing.enabled }, after: { enabled: patch.enabled }, req,
    });
  }
  if (patch.maintenanceMode !== undefined && patch.maintenanceMode !== existing.maintenanceMode) {
    writeAdminToolsAuditLog({
      toolSlug: slug, userId: user.id, userName: user.name,
      action: patch.maintenanceMode ? 'TOOL_MAINTENANCE_ON' : 'TOOL_MAINTENANCE_OFF',
      before: { maintenanceMode: existing.maintenanceMode }, after: { maintenanceMode: patch.maintenanceMode }, req,
    });
  }

  return NextResponse.json({ tool: updated });
}
