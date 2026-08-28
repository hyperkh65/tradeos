'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, FileCheck2, Plus, Trash2, Save, Send, Upload, RotateCw, X } from 'lucide-react';
import { TABLE_SECTION_CONFIG, ATTACHMENT_SECTION_CATEGORIES, SCALAR_SECTION_FIELDS } from '@/lib/approval-doc/table-sections';
import { defaultTitleFor } from '@/lib/approval-doc/section-registry';
import type { BuiltinSectionType } from '@/lib/approval-doc/types';

type Lang = 'ko' | 'zh' | 'en';

const UI: Record<Lang, Record<string, string>> = {
  zh: {
    title: '产品资料填写', save: '保存草稿', submit: '提交', submitting: '提交中...',
    submitterPrompt: '请输入您的姓名以完成提交',
    revisionHistory: '修订历史', generalSpec: '一般规格', addRow: '添加一行', notReady: '此章节类型正在开发中，暂不可填写。',
    date: '日期', version: '版本', note: '变更内容', tracedBy: '负责人',
    saved: '已保存', closed: '本项目已关闭，无法编辑。', upload: '上传文件', uploading: '上传中...',
    noFiles: '尚未上传任何文件。', delete: '删除',
  },
  en: {
    title: 'Product Data Entry', save: 'Save Draft', submit: 'Submit', submitting: 'Submitting...',
    submitterPrompt: 'Enter your name to complete submission',
    revisionHistory: 'Revision History', generalSpec: 'General Specification', addRow: 'Add Row', notReady: 'This section type is still under development.',
    date: 'Date', version: 'Version', note: 'Change Note', tracedBy: 'Traced By',
    saved: 'Saved', closed: 'This project is closed and cannot be edited.', upload: 'Upload File', uploading: 'Uploading...',
    noFiles: 'No files uploaded yet.', delete: 'Delete',
  },
  ko: {
    title: '제품 자료 작성', save: '임시저장', submit: '제출하기', submitting: '제출 중...',
    submitterPrompt: '제출자 이름을 입력하세요',
    revisionHistory: '개정이력', generalSpec: '일반사양', addRow: '행 추가', notReady: '이 섹션 유형은 아직 준비 중입니다.',
    date: '개정일', version: '개정번호', note: '변경 내용', tracedBy: '작성자',
    saved: '저장됨', closed: '이 프로젝트는 마감되어 수정할 수 없습니다.', upload: '파일 업로드', uploading: '업로드 중...',
    noFiles: '아직 업로드된 파일이 없습니다.', delete: '삭제',
  },
};

interface ProjectInfo {
  businessId: string; productName: string; modelName: string; docType: string;
  status: string; defaultLanguage: Lang;
}
interface SectionRow { id: string; sectionType: string; included: boolean; customTitle: string | null; chapterNumber: number | null }
interface RevisionRow { id: string; versionLabel: string; revisionDate: string | null; noteOriginal: string | null; tracedBy: string | null; sortOrder: number }
interface SpecRow {
  id: string; division: string | null; inspectionItem: string; unit: string | null;
  specValueOriginal: string | null; minValueOriginal: string | null; maxValueOriginal: string | null; sortOrder: number;
}
interface AttachmentRow { id: string; categoryKey: string; originalFilename: string; sizeBytes: number; description: string | null; createdAt: string }

function sectionTitle(s: SectionRow, lang: Lang): string {
  if (s.customTitle?.trim()) return s.customTitle;
  return defaultTitleFor(s.sectionType, lang);
}

/** 표 형태 섹션(치수/포장/시험/인증/부품표 등) 공용 편집 컴포넌트 — table-sections.ts의
 * 컬럼 정의 하나로 모든 표 섹션을 처리한다(섹션마다 별도 컴포넌트를 만들지 않기 위한 설계). */
function GenericTableEditor({ token, sectionId, sectionType, lang, disabled, t }: {
  token: string; sectionId: string; sectionType: BuiltinSectionType; lang: Lang; disabled: boolean; t: (k: string) => string;
}) {
  const config = TABLE_SECTION_CONFIG[sectionType]!;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/approval-form/${token}/sections/${sectionId}/rows`).then(r => r.json()).then(j => { setRows(j.data || []); setLoaded(true); });
  }, [token, sectionId]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/rows`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setRows(j.data);
    } finally { setSaving(false); }
  };

  const [importing, setImporting] = useState(false);
  const importXlsx = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/rows/xlsx`, { method: 'POST', body: formData });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      // 여기서 바로 저장하지 않고 편집 상태만 채운다 — 사용자가 검토 후 "임시저장"을 눌러야
      // 실제로 반영된다(요청서: 적용 전 검토 화면 표시).
      setRows(j.data.rows);
      if (j.data.unmatchedHeaders?.length) {
        alert((lang === 'zh' ? '以下列未能识别，请检查：\n' : lang === 'en' ? 'The following columns were not recognized:\n' : '다음 열은 인식하지 못했습니다:\n') + j.data.unmatchedHeaders.join(', '));
      }
    } finally { setImporting(false); }
  };

  if (!loaded) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border min-w-[600px]">
          <thead className="bg-muted/50">
            <tr>
              {config.columns.map(c => <th key={c.key} className="p-2 text-left border-b whitespace-nowrap">{c.label[lang]}</th>)}
              <th className="p-2 border-b w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={(row.id as string) || idx} className="border-b">
                {config.columns.map(c => (
                  <td key={c.key} className="p-1">
                    <input
                      disabled={disabled}
                      type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'}
                      className="w-full border rounded px-1.5 py-1 text-sm min-w-[100px]"
                      value={(row[c.key] as string) || ''}
                      onChange={e => setRows(rs => rs.map((r, i) => i === idx ? { ...r, [c.key]: e.target.value } : r))}
                    />
                  </td>
                ))}
                <td className="p-1 text-center">
                  {!disabled && <button onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 items-center">
        {!disabled && <button onClick={() => setRows(rs => [...rs, {}])} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('addRow')}</button>}
        <a href={`/api/approval-form/${token}/sections/${sectionId}/rows/xlsx?blank=1`} className="text-xs text-muted-foreground hover:text-foreground underline">
          {lang === 'zh' ? '下载空白模板' : lang === 'en' ? 'Download Blank Template' : '빈 양식 다운로드'}
        </a>
        <a href={`/api/approval-form/${token}/sections/${sectionId}/rows/xlsx`} className="text-xs text-muted-foreground hover:text-foreground underline">
          {lang === 'zh' ? '下载当前表格' : lang === 'en' ? 'Download Current Table' : '현재 표 다운로드'}
        </a>
        {!disabled && (
          <label className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer">
            {importing ? (lang === 'zh' ? '导入中...' : lang === 'en' ? 'Importing...' : '가져오는 중...') : (lang === 'zh' ? '从XLSX导入' : lang === 'en' ? 'Import from XLSX' : 'XLSX에서 가져오기')}
            <input type="file" accept=".xlsx" className="hidden" disabled={importing} onChange={e => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ''; }} />
          </label>
        )}
        {!disabled && (
          <button onClick={save} disabled={saving} className="ml-auto text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded flex items-center gap-1">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{t('save')}
          </button>
        )}
      </div>
    </div>
  );
}

/** PDF 첨부 하나에 대해 "몇 페이지를 승인서 본문에 이미지로 넣을지" 선택하는 위젯 —
 * 요청서 §9 "PDF는 원하는 페이지를 승인서에 삽입할 수 있게 하고... 여러 페이지를 연속
 * 삽입". 페이지 수를 누르면 그때 처음 불러오고(모든 PDF마다 미리 변환할 필요 없음),
 * 삽입 지정한 페이지는 목록으로 보여주고 각각 해제할 수 있다. */
function PdfPageSelector({ token, sectionId, attachmentId, disabled, lang }: {
  token: string; sectionId: string; attachmentId: string; disabled: boolean; lang: Lang;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [insertedPages, setInsertedPages] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [busy, setBusy] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/pdf-pages`);
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setPageCount(j.data.pageCount);
      setInsertedPages(j.data.insertedPages || []);
    } finally { setLoading(false); }
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && pageCount == null) load();
  };

  const insertPage = async () => {
    const page = Number(pageInput);
    if (!Number.isFinite(page) || page < 1 || (pageCount && page > pageCount)) { alert('페이지 번호를 확인하세요.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/insert-page`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setInsertedPages(p => [...p, page].sort((a, b) => a - b));
    } finally { setBusy(false); }
  };

  const removePage = async (page: number) => {
    setBusy(true);
    try {
      await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/insert-page?page=${page}`, { method: 'DELETE' });
      setInsertedPages(p => p.filter(x => x !== page));
    } finally { setBusy(false); }
  };

  const label = lang === 'zh' ? '选择插入页面' : lang === 'en' ? 'Select pages to insert' : 'PDF 페이지 선택 삽입';

  return (
    <div className="border-t pt-1.5">
      <button onClick={toggleExpand} className="text-primary hover:underline text-[11px]">{label} {insertedPages.length > 0 ? `(${insertedPages.length})` : ''}</button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pageCount == null ? (
            <span className="text-[11px] text-red-500">PDF 변환 서버를 사용할 수 없습니다.</span>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">총 {pageCount}페이지</div>
              {insertedPages.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {insertedPages.map(p => (
                    <span key={p} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[11px]">
                      p.{p}
                      <button onClick={() => setPreviewPage(p)} className="underline">보기</button>
                      {!disabled && <button onClick={() => removePage(p)} disabled={busy}><X className="w-2.5 h-2.5" /></button>}
                    </span>
                  ))}
                </div>
              )}
              {!disabled && (
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={pageCount} value={pageInput} onChange={e => setPageInput(e.target.value)} className="w-14 border rounded px-1 py-0.5 text-[11px]" />
                  <button onClick={insertPage} disabled={busy} className="text-[11px] text-primary hover:underline">삽입</button>
                  <button onClick={() => setPreviewPage(Number(pageInput))} className="text-[11px] text-muted-foreground hover:underline">미리보기</button>
                </div>
              )}
            </>
          )}
          {previewPage != null && (
            <div className="border rounded p-1 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/pdf-pages/${previewPage}`}
                alt={`page ${previewPage}`}
                className="max-w-[160px] max-h-[200px] object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface EditState { placementId: string; rotationDeg: number; cropRect: { x: number; y: number; w: number; h: number } | null; bgRemoved: boolean; hasEditedFile: boolean }

/** 이미지 자르기/회전/배경정리 + "문서에 삽입" 마커를 한 화면에서 다룬다. 편집 없이
 * "삽입"만 눌러도 원본이 그대로 문서에 들어가고, 자르기/회전을 적용하면 항상 원본
 * 기준으로 다시 계산된 결과로 교체된다(edit/route.ts 주석 참고 — 누적 적용 아님). */
function ImageCropEditor({ token, sectionId, attachmentId, disabled, lang }: {
  token: string; sectionId: string; attachmentId: string; disabled: boolean; lang: Lang;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotationDraft, setRotationDraft] = useState(0);
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bgRemoveDraft, setBgRemoveDraft] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/edit`);
      const j = await r.json();
      const s: EditState | null = j.data || null;
      setState(s);
      setRotationDraft(s?.rotationDeg || 0);
      setCropDraft(s?.cropRect || null);
      setBgRemoveDraft(s?.bgRemoved || false);
    } finally { setLoading(false); setLoadedOnce(true); }
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loadedOnce) load();
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotationDeg: rotationDraft, crop: cropDraft, bgRemove: bgRemoveDraft }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      await load();
    } finally { setBusy(false); }
  };

  const removeInsertion = async () => {
    setBusy(true);
    try {
      await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/edit`, { method: 'DELETE' });
      setCropDraft(null); setRotationDraft(0); setBgRemoveDraft(false);
      await load();
    } finally { setBusy(false); }
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({ startX: (e.clientX - rect.left) / rect.width, startY: (e.clientY - rect.top) / rect.height });
    setCropDraft(null);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const curY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const x = Math.min(drag.startX, curX), y = Math.min(drag.startY, curY);
    const w = Math.abs(curX - drag.startX), h = Math.abs(curY - drag.startY);
    setCropDraft({ x, y, w, h });
  };
  const onMouseUp = () => setDrag(null);

  const label = lang === 'zh' ? '图片编辑/插入' : lang === 'en' ? 'Edit / Insert Image' : '이미지 편집/삽입';
  const inserted = !!state;

  return (
    <div className="border-t pt-1.5">
      <button onClick={toggleExpand} className="text-primary hover:underline text-[11px]">
        {label} {inserted ? <span className="text-green-600">(삽입됨{state?.hasEditedFile ? ' · 편집됨' : ''})</span> : ''}
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
            <>
              <div
                className="relative border rounded overflow-hidden inline-block max-w-full select-none cursor-crosshair"
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/file`}
                  alt="" className="max-w-[260px] max-h-[260px] object-contain block pointer-events-none"
                />
                {cropDraft && (
                  <div
                    className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                    style={{ left: `${cropDraft.x * 100}%`, top: `${cropDraft.y * 100}%`, width: `${cropDraft.w * 100}%`, height: `${cropDraft.h * 100}%` }}
                  />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">이미지 위에서 드래그해 잘라낼 영역을 지정하세요. (선택 안 하면 원본 그대로, 자르기 → 회전 순서로 적용됩니다)</p>
              {!disabled && (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setRotationDraft(r => (r + 90) % 360)} disabled={busy} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    <RotateCw className="w-3 h-3" />{rotationDraft}°
                  </button>
                  <label className="text-[11px] flex items-center gap-1">
                    <input type="checkbox" checked={bgRemoveDraft} onChange={e => setBgRemoveDraft(e.target.checked)} />배경 정리
                  </label>
                  {cropDraft && <button onClick={() => setCropDraft(null)} className="text-[11px] text-muted-foreground hover:underline">자르기 취소</button>}
                  <button onClick={apply} disabled={busy} className="text-[11px] text-primary hover:underline font-medium">
                    {busy ? '적용 중...' : inserted ? '적용' : '문서에 삽입'}
                  </button>
                  {inserted && <button onClick={removeInsertion} disabled={busy} className="text-[11px] text-red-500 hover:underline">삽입 해제</button>}
                </div>
              )}
              {state?.hasEditedFile && (
                <div className="border rounded p-1 inline-block">
                  <div className="text-[10px] text-muted-foreground mb-0.5">현재 문서에 삽입되는 이미지</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}/edit/preview?t=${state.placementId}`} alt="" className="max-w-[160px] max-h-[160px] object-contain" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 첨부파일 목록 섹션(회로도/PCB도면/광학특성/RoHS) 공용 컴포넌트. */
function GenericAttachmentUploader({ token, sectionId, sectionType, lang, disabled, t }: {
  token: string; sectionId: string; sectionType: BuiltinSectionType; lang: Lang; disabled: boolean; t: (k: string) => string;
}) {
  const categories = ATTACHMENT_SECTION_CATEGORIES[sectionType] || [];
  const [files, setFiles] = useState<AttachmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments`).then(r => r.json()).then(j => { setFiles(j.data || []); setLoaded(true); });
  }, [token, sectionId]);
  useEffect(() => { setLoaded(false); load(); }, [load]);

  const upload = async (categoryKey: string, file: File) => {
    setUploadingKey(categoryKey);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('categoryKey', categoryKey);
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments`, { method: 'POST', body: formData });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      if (j.data?.warning) alert(j.data.warning);
      load();
    } finally { setUploadingKey(null); }
  };

  const remove = async (attachmentId: string) => {
    if (!confirm(t('delete') + '?')) return;
    await fetch(`/api/approval-form/${token}/sections/${sectionId}/attachments/${attachmentId}`, { method: 'DELETE' });
    load();
  };

  const isImage = (filename: string) => /\.(png|jpe?g)$/i.test(filename);

  if (!loaded) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const catFiles = files.filter(f => f.categoryKey === cat.key);
        return (
          <div key={cat.key} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{cat.label[lang]}</span>
              {!disabled && (
                <label className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer">
                  {uploadingKey === cat.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploadingKey === cat.key ? t('uploading') : t('upload')}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf" className="hidden" disabled={uploadingKey === cat.key}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(cat.key, f); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {catFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('noFiles')}</p>
            ) : (
              <ul className="space-y-1">
                {catFiles.map(f => (
                  <li key={f.id} className="text-xs bg-muted/30 rounded px-2 py-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">{f.originalFilename}</span>
                      <span className="text-muted-foreground shrink-0">{(f.sizeBytes / 1024).toFixed(0)}KB</span>
                      {!disabled && <button onClick={() => remove(f.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                    </div>
                    {/\.pdf$/i.test(f.originalFilename) && (
                      <PdfPageSelector token={token} sectionId={sectionId} attachmentId={f.id} disabled={disabled} lang={lang} />
                    )}
                    {isImage(f.originalFilename) && (
                      <ImageCropEditor token={token} sectionId={sectionId} attachmentId={f.id} disabled={disabled} lang={lang} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** product_overview 등 "단순 텍스트 필드"만 있는 섹션 공용 컴포넌트. */
function GenericScalarForm({ token, sectionId, sectionType, lang, disabled, t }: {
  token: string; sectionId: string; sectionType: BuiltinSectionType; lang: Lang; disabled: boolean; t: (k: string) => string;
}) {
  const fields = SCALAR_SECTION_FIELDS[sectionType] || [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/approval-form/${token}/sections/${sectionId}/scalar`).then(r => r.json()).then(j => { setValues(j.data || {}); setLoaded(true); });
  }, [token, sectionId]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/sections/${sectionId}/scalar`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setValues(j.data);
    } finally { setSaving(false); }
  };

  if (!loaded) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="text-xs text-muted-foreground mb-1 block">{f.label[lang]}</label>
          {f.multiline ? (
            <textarea disabled={disabled} className="w-full border rounded px-2 py-1.5 text-sm min-h-[70px]" value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
          ) : (
            <input disabled={disabled} className="w-full border rounded px-2 py-1.5 text-sm" value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
          )}
        </div>
      ))}
      {!disabled && (
        <button onClick={save} disabled={saving} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded flex items-center gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{t('save')}
        </button>
      )}
    </div>
  );
}

export default function ApprovalFormPage() {
  const { token } = useParams<{ token: string }>();
  const [lang, setLang] = useState<Lang>('zh');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revisionRows, setRevisionRows] = useState<RevisionRow[]>([]);
  const [specRows, setSpecRows] = useState<SpecRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const t = (key: string) => UI[lang][key] || key;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/approval-form/${token}`).then(async r => {
      const j = await r.json();
      if (!r.ok) { setError(j.error || '오류가 발생했습니다.'); return; }
      setProject(j.data.project);
      setLang(j.data.project.defaultLanguage || 'zh');
      const included: SectionRow[] = j.data.sections.filter((s: SectionRow) => s.included);
      setSections(included);
      if (included.length > 0) setActiveId(prev => prev ?? included[0].id);
    }).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const active = sections.find(s => s.id === activeId);
    if (!active) return;
    if (active.sectionType === 'revision_history') {
      fetch(`/api/approval-form/${token}/revision-history`).then(r => r.json()).then(j => setRevisionRows(j.data || []));
    } else if (active.sectionType === 'general_spec') {
      fetch(`/api/approval-form/${token}/general-spec`).then(r => r.json()).then(j => setSpecRows(j.data || []));
    }
  }, [activeId, sections, token]);

  const isClosed = project?.status === 'closed';

  const saveRevisionHistory = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/revision-history`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: revisionRows.map((r, i) => ({ ...r, sortOrder: i })) }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setRevisionRows(j.data);
      setSavedAt(Date.now());
    } finally { setSaving(false); }
  };

  const saveGeneralSpec = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/general-spec`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: specRows.map((r, i) => ({ ...r, sortOrder: i })) }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error); return; }
      setSpecRows(j.data);
      setSavedAt(Date.now());
    } finally { setSaving(false); }
  };

  const submit = async () => {
    const submitterName = prompt(t('submitterPrompt'));
    if (!submitterName?.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/approval-form/${token}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submitterName }),
      });
      const j = await r.json();
      if (!r.ok) {
        const detail = Array.isArray(j.issues) ? '\n\n' + j.issues.map((i: { message: string }) => `- ${i.message}`).join('\n') : '';
        alert((j.error || '제출 실패') + detail);
        return;
      }
      load();
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error || !project) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{error || '오류'}</div>;

  const active = sections.find(s => s.id === activeId);
  const activeType = active?.sectionType as BuiltinSectionType | undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">{project.businessId} — {project.productName}</div>
            <div className="text-xs text-muted-foreground">{project.modelName}</div>
          </div>
        </div>
        <select value={lang} onChange={e => setLang(e.target.value as Lang)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="zh">中文</option>
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </select>
      </div>

      {isClosed && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 text-center">{t('closed')}</div>}

      <div className="flex-1 grid grid-cols-[220px_1fr_260px] min-h-0">
        {/* 왼쪽: 섹션 목록 */}
        <div className="border-r overflow-y-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b flex items-center gap-2 ${s.id === activeId ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
            >
              <span className="text-xs text-muted-foreground w-5 shrink-0">{s.chapterNumber ?? '-'}</span>
              <span className="truncate">{sectionTitle(s, lang)}</span>
            </button>
          ))}
        </div>

        {/* 가운데: 입력 화면 — 섹션 타입에 따라 전용/제네릭 컴포넌트로 분기 */}
        <div className="overflow-y-auto p-5">
          {!active ? (
            <p className="text-sm text-muted-foreground">{t('notReady')}</p>
          ) : active.sectionType === 'revision_history' ? (
            <div>
              <h2 className="font-semibold mb-3">{t('revisionHistory')}</h2>
              <table className="w-full text-sm border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left border-b">{t('date')}</th>
                    <th className="p-2 text-left border-b">{t('version')}</th>
                    <th className="p-2 text-left border-b">{t('note')}</th>
                    <th className="p-2 text-left border-b">{t('tracedBy')}</th>
                    <th className="p-2 border-b w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {revisionRows.map((row, idx) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-1"><input disabled={isClosed} type="date" className="w-full border rounded px-1.5 py-1 text-sm" value={row.revisionDate || ''} onChange={e => setRevisionRows(rs => rs.map((r, i) => i === idx ? { ...r, revisionDate: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.versionLabel} onChange={e => setRevisionRows(rs => rs.map((r, i) => i === idx ? { ...r, versionLabel: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.noteOriginal || ''} onChange={e => setRevisionRows(rs => rs.map((r, i) => i === idx ? { ...r, noteOriginal: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.tracedBy || ''} onChange={e => setRevisionRows(rs => rs.map((r, i) => i === idx ? { ...r, tracedBy: e.target.value } : r))} /></td>
                      <td className="p-1 text-center">{!isClosed && <button onClick={() => setRevisionRows(rs => rs.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isClosed && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setRevisionRows(rs => [...rs, { id: `new-${Date.now()}`, versionLabel: '', revisionDate: null, noteOriginal: null, tracedBy: null, sortOrder: rs.length }])} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('addRow')}</button>
                  <button onClick={saveRevisionHistory} disabled={saving} className="ml-auto text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded flex items-center gap-1">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{t('save')}
                  </button>
                </div>
              )}
            </div>
          ) : active.sectionType === 'general_spec' ? (
            <div>
              <h2 className="font-semibold mb-3">{t('generalSpec')}</h2>
              <table className="w-full text-sm border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left border-b">구분</th>
                    <th className="p-2 text-left border-b">항목</th>
                    <th className="p-2 text-left border-b">단위</th>
                    <th className="p-2 text-left border-b">기준값</th>
                    <th className="p-2 text-left border-b">최소값</th>
                    <th className="p-2 text-left border-b">최대값</th>
                    <th className="p-2 border-b w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {specRows.map((row, idx) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.division || ''} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, division: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.inspectionItem} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, inspectionItem: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.unit || ''} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.specValueOriginal || ''} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, specValueOriginal: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.minValueOriginal || ''} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, minValueOriginal: e.target.value } : r))} /></td>
                      <td className="p-1"><input disabled={isClosed} className="w-full border rounded px-1.5 py-1 text-sm" value={row.maxValueOriginal || ''} onChange={e => setSpecRows(rs => rs.map((r, i) => i === idx ? { ...r, maxValueOriginal: e.target.value } : r))} /></td>
                      <td className="p-1 text-center">{!isClosed && <button onClick={() => setSpecRows(rs => rs.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isClosed && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSpecRows(rs => [...rs, { id: `new-${Date.now()}`, division: '', inspectionItem: '', unit: '', specValueOriginal: '', minValueOriginal: '', maxValueOriginal: '', sortOrder: rs.length }])} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('addRow')}</button>
                  <button onClick={saveGeneralSpec} disabled={saving} className="ml-auto text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded flex items-center gap-1">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{t('save')}
                  </button>
                </div>
              )}
            </div>
          ) : activeType && TABLE_SECTION_CONFIG[activeType] ? (
            <div>
              <h2 className="font-semibold mb-3">{sectionTitle(active, lang)}</h2>
              <GenericTableEditor key={active.id} token={token} sectionId={active.id} sectionType={activeType} lang={lang} disabled={isClosed} t={t} />
            </div>
          ) : activeType && ATTACHMENT_SECTION_CATEGORIES[activeType] ? (
            <div>
              <h2 className="font-semibold mb-3">{sectionTitle(active, lang)}</h2>
              <GenericAttachmentUploader key={active.id} token={token} sectionId={active.id} sectionType={activeType} lang={lang} disabled={isClosed} t={t} />
            </div>
          ) : activeType && SCALAR_SECTION_FIELDS[activeType] ? (
            <div>
              <h2 className="font-semibold mb-3">{sectionTitle(active, lang)}</h2>
              <GenericScalarForm key={active.id} token={token} sectionId={active.id} sectionType={activeType} lang={lang} disabled={isClosed} t={t} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('notReady')}</p>
          )}
        </div>

        {/* 오른쪽: 도움말 */}
        <div className="border-l p-4 text-xs text-muted-foreground overflow-y-auto">
          {active?.sectionType === 'revision_history' && <p>{lang === 'zh' ? '每次修改产品资料时，请在此记录修改日期、版本号及变更内容。' : lang === 'en' ? 'Record the date, version, and change note each time the product data is revised.' : '제품 자료를 수정할 때마다 개정일, 개정번호, 변경 내용을 기록하세요.'}</p>}
          {active?.sectionType === 'general_spec' && <p>{lang === 'zh' ? '请填写产品的实际规格值。规格值与检测基准值请勿混淆。' : lang === 'en' ? 'Enter the actual product specification values. Do not mix spec values with test/certification reference values.' : '제품의 실제 사양값을 입력하세요. 기준값(시험/인증 기준)과 혼동하지 마세요.'}</p>}
          {activeType && TABLE_SECTION_CONFIG[activeType] && <p>{lang === 'zh' ? '请按行填写，可随时添加或删除行。' : lang === 'en' ? 'Fill in row by row. You can add or remove rows freely.' : '행 단위로 입력하세요. 행은 자유롭게 추가·삭제할 수 있습니다.'}</p>}
          {activeType && ATTACHMENT_SECTION_CATEGORIES[activeType] && <p>{lang === 'zh' ? '请上传能清楚显示相关信息的高分辨率文件（PDF/图片）。' : lang === 'en' ? 'Upload high-resolution files (PDF/image) that clearly show the required information.' : '내용을 명확히 확인할 수 있는 고해상도 파일(PDF/이미지)을 첨부하세요.'}</p>}
        </div>
      </div>

      <div className="border-t px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{savedAt ? t('saved') : ''}</span>
        <div className="flex items-center gap-2">
          {!isClosed && (
            <button
              onClick={async () => {
                const r = await fetch(`/api/approval-form/${token}/validate`);
                const j = await r.json();
                const issues: { message: string; severity: string }[] = j.data || [];
                if (issues.length === 0) { alert(lang === 'zh' ? '未发现遗漏项目。' : lang === 'en' ? 'No missing items found.' : '누락된 항목이 없습니다.'); return; }
                alert(issues.map(i => `[${i.severity === 'blocking' ? (lang === 'ko' ? '필수' : lang === 'zh' ? '必填' : 'Required') : (lang === 'ko' ? '권장' : lang === 'zh' ? '建议' : 'Recommended')}] ${i.message}`).join('\n'));
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {lang === 'zh' ? '检查遗漏项目' : lang === 'en' ? 'Check Missing Items' : '누락 항목 확인'}
            </button>
          )}
          {!isClosed && (
            <button onClick={submit} disabled={submitting} className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded flex items-center gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{submitting ? t('submitting') : t('submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
