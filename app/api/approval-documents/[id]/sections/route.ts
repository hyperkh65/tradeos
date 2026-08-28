import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { computeChapterNumbers } from '@/lib/approval-doc/numbering';
import type { Lang, SectionInstance } from '@/lib/approval-doc/types';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, sectionType: row.section_type, included: !!row.included,
    sortOrder: row.sort_order, customTitle: row.custom_title,
    dataJson: row.data_json, notes: row.notes,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT final_language FROM approval_doc_projects WHERE id=?').get(id) as { final_language: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=? ORDER BY sort_order').all(id) as Record<string, unknown>[];

  // 화면에서 "포함하면 몇 장이 될지" 미리 보여주기 위한 채번 미리보기 — 실제 문서 생성 시엔
  // generate-pipeline.ts가 이 값을 쓰지 않고 항상 다시 계산한다(numbering.ts 주석 참고).
  const instances: SectionInstance[] = rows.map(r => ({
    id: r.id as string, projectId: id, sectionType: r.section_type as SectionInstance['sectionType'],
    included: !!r.included, sortOrder: r.sort_order as number, customTitle: r.custom_title as string | null,
  }));
  const numbered = computeChapterNumbers(instances, (project.final_language as Lang) || 'ko');
  const chapterById = new Map(numbered.map(n => [n.id, n.chapterNumber]));

  return NextResponse.json({
    data: rows.map(r => ({ ...toClient(r), previewChapterNumber: chapterById.get(r.id as string) ?? null })),
  });
}

interface SectionPutItem {
  id?: string; // 없으면 새 커스텀 섹션
  sectionType: string;
  included: boolean;
  sortOrder: number;
  customTitle?: string | null;
}

/**
 * 섹션 목록 전체를 통째로 교체한다(체크박스 토글·드래그순서변경·커스텀섹션추가를 화면에서
 * 한 번에 저장하는 UX에 맞춘 벌크 업데이트) — id가 있으면 UPDATE, 없으면 새로 INSERT.
 * 요청 목록에 없는 기존 행은 삭제하지 않는다(실수로 목록에서 빠진 항목이 통째로 사라지는
 * 사고를 막기 위함 — 섹션 삭제는 반드시 명시적인 별도 액션이어야 한다).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_doc_projects WHERE id=?').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json();
  const items: SectionPutItem[] = Array.isArray(body.sections) ? body.sections : [];
  if (items.length === 0) return NextResponse.json({ error: '섹션 목록이 비어 있습니다.' }, { status: 400 });
  for (const it of items) {
    if (it.sectionType === 'custom' && !it.customTitle?.trim()) {
      return NextResponse.json({ error: '사용자 정의 섹션은 제목이 필요합니다.' }, { status: 400 });
    }
  }

  const before = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=? ORDER BY sort_order').all(id);
  const ts = now();
  const update = db.prepare(`UPDATE approval_doc_sections SET included=?, sort_order=?, custom_title=?, updated_at=? WHERE id=? AND project_id=?`);
  const insert = db.prepare(`INSERT INTO approval_doc_sections
    (id, project_id, section_type, included, sort_order, custom_title, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`);

  db.transaction(() => {
    for (const it of items) {
      if (it.id) {
        update.run(it.included ? 1 : 0, it.sortOrder, it.customTitle ?? null, ts, it.id, id);
      } else {
        insert.run(newId(), id, it.sectionType, it.included ? 1 : 0, it.sortOrder, it.customTitle ?? null, ts, ts);
      }
    }
    db.prepare('UPDATE approval_doc_projects SET updated_at=? WHERE id=?').run(ts, id);
  })();

  writeApprovalAuditLog({ projectId: id, action: 'section_reorder', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: items, req });

  const rows = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=? ORDER BY sort_order').all(id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
