import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    const steps = JSON.parse(row.steps_json as string);
    return NextResponse.json({ ...row, steps });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

    const steps: Array<{
      order: number;
      approverId: string;
      approverName: string;
      status: string;
      comment: string | null;
      actedAt: string | null;
    }> = JSON.parse(row.steps_json as string);

    // 임시저장 → 기안 상신
    if (body.action === 'submit') {
      db.prepare(`UPDATE approvals SET status = '대기', updated_at = ? WHERE id = ? AND status = '임시저장'`).run(now(), id);
      const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown>;
      return NextResponse.json({ ...updated, steps: JSON.parse(updated.steps_json as string) });
    }

    const stepOrder = body.stepOrder as number;
    const action = body.action as 'approve' | 'reject';
    const comment = body.comment ?? null;

    const stepIdx = steps.findIndex(s => s.order === stepOrder);
    if (stepIdx !== -1) {
      steps[stepIdx].status = action === 'approve' ? '승인' : '반려';
      steps[stepIdx].comment = comment;
      steps[stepIdx].actedAt = now();
    }

    const allApproved = steps.every(s => s.status === '승인');
    const anyRejected = steps.some(s => s.status === '반려');
    let overallStatus = '대기';
    if (anyRejected) overallStatus = '반려';
    else if (allApproved) overallStatus = '승인';
    else {
      const nextStep = steps.find(s => s.status === '대기');
      overallStatus = nextStep ? '진행중' : '대기';
    }

    const nextPending = steps.find(s => s.status === '대기');
    const currentStep = nextPending ? nextPending.order : (row.current_step as number);

    db.prepare(`
      UPDATE approvals SET steps_json = ?, current_step = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(steps), currentStep, overallStatus, now(), id);

    const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown>;
    return NextResponse.json({ ...updated, steps: JSON.parse(updated.steps_json as string) });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
