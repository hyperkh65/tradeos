import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { computeChapterNumbers } from '@/lib/approval-doc/numbering';
import type { Lang, SectionInstance } from '@/lib/approval-doc/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, false); // 조회는 마감 상태에서도 허용(읽기전용 표시)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const db = getDb();
  const { project } = guard;
  const sectionRows = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=? ORDER BY sort_order').all(project.id) as Record<string, unknown>[];

  const instances: SectionInstance[] = sectionRows.map(r => ({
    id: r.id as string, projectId: project.id, sectionType: r.section_type as SectionInstance['sectionType'],
    included: !!r.included, sortOrder: r.sort_order as number, customTitle: r.custom_title as string | null,
  }));
  const numbered = computeChapterNumbers(instances, (project.final_language as Lang) || 'ko');
  const chapterById = new Map(numbered.map(n => [n.id, n.chapterNumber]));

  return NextResponse.json({
    data: {
      project: {
        businessId: project.business_id, productName: project.product_name, modelName: project.model_name,
        docType: project.doc_type, revision: project.revision, customerName: project.customer_name,
        supplierName: project.supplier_name, status: project.status, defaultLanguage: project.default_language,
      },
      sections: sectionRows.map(r => ({
        id: r.id, sectionType: r.section_type, included: !!r.included, sortOrder: r.sort_order,
        customTitle: r.custom_title, dataJson: r.data_json, chapterNumber: chapterById.get(r.id as string) ?? null,
      })),
    },
  });
}
