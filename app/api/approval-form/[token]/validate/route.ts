import { NextRequest, NextResponse } from 'next/server';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { validateProject } from '@/lib/approval-doc/validate';

/** 외부 작성자가 제출 전에 "누락 항목 확인"할 수 있게 하는 조회 전용 엔드포인트. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const issues = validateProject(guard.project.id);
  return NextResponse.json({ data: issues });
}
