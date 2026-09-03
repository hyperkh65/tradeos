import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest } from '@/lib/approval-inspection/token';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, productId: row.product_id, targetField: row.target_field, targetPhotoId: row.target_photo_id,
    requestContent: row.request_content, requestedByName: row.requested_by_name, requestedAt: row.requested_at,
    supplierResponse: row.supplier_response, status: row.status, completedAt: row.completed_at,
  };
}

/** §16 "외부 사용자에게 경고색으로 보이는" 수정요청 목록 — 조회만 가능, 생성은 내부만. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE project_id=? ORDER BY requested_at DESC').all(guard.project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
