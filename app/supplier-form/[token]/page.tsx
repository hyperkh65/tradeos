'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Upload, Check, AlertCircle, Lock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DISPLAY_FIELDS, BASE_MODEL_INFO_FIELDS, TEST_CATEGORY_OPTIONS, DERIVED_CHANGE_ITEMS,
  ORIGIN_MARKING_SUBFIELDS, LED_ARRAY_SUBFIELDS, FIXTURE_PART_FIXED_ROWS, CONVERTER_TYPE_LABELS,
  getVisibleAttachmentCategories, type Lang, type ConverterType, type I18nText,
} from '@/lib/supplier-form/field-schema';

const UI: Record<Lang, Record<string, string>> = {
  ko: {
    loading: '불러오는 중...', notFound: '유효하지 않은 링크입니다.',
    saveDraft: '임시저장', submit: '제출하기', saving: '저장 중...', submitting: '제출 중...',
    savedAt: '저장됨', submitSuccess: '제출이 완료되었습니다.', submitFailed: '제출할 수 없습니다 — 아래 항목을 확인해주세요.',
    required: '필수', testCategory: '시험 구분', baseModelInfo: '기본모델 정보 (파생/변경 시 필수)',
    derivedChangeItems: '파생모델 및 부품변경 구분', displayFields: '표시사항', converterType: '컨버터 사용 여부',
    fixtureParts: '등기구 부품 리스트', converterParts: '컨버터 내부 부품 리스트 (일체형 컨버터 전용)',
    multiComponent: '복수부품 등재', attachments: '첨부파일', remark: '요청사항 / 메모',
    submitterName: '제출자 이름', addRow: '행 추가', removeRow: '삭제',
    uploadHint: '클릭 또는 드래그하여 PDF 업로드', uploading: '업로드 중...', fileDesc: '파일 설명',
    preview: '미리보기', download: '다운로드', delete: '삭제', missingItemsTitle: '누락된 항목',
    closedBanner: '자료 제출이 마감되었습니다. 현재 내용을 수정할 수 없습니다.',
    partName: '형명', spec: '명세', material: '재질', width: '가로(mm)', depth: '세로(mm)', height: '높이/두께(mm)',
    qty: '수량', manufacturer: '제조회사', remarkCol: '비고', unit: '단위',
    reasonRequired: '필수', reasonFormat: '형식이 올바르지 않습니다', reasonMismatch: '값이 일치하지 않습니다', reasonNoKorean: '한국어 확정값이 필요합니다',
  },
  zh: {
    loading: '加载中...', notFound: '无效的链接。',
    saveDraft: '暂存', submit: '提交', saving: '保存中...', submitting: '提交中...',
    savedAt: '已保存', submitSuccess: '提交完成。', submitFailed: '无法提交 — 请检查以下项目。',
    required: '必填', testCategory: '测试类别', baseModelInfo: '基本型号信息（派生/变更时必填）',
    derivedChangeItems: '派生型号及部件变更分类', displayFields: '标示事项', converterType: '是否使用驱动电源',
    fixtureParts: '灯具部件清单', converterParts: '驱动电源内部部件清单（仅限一体式驱动电源）',
    multiComponent: '多组件登记', attachments: '附件', remark: '备注/要求事项',
    submitterName: '提交人姓名', addRow: '添加行', removeRow: '删除',
    uploadHint: '点击或拖拽上传PDF', uploading: '上传中...', fileDesc: '文件说明',
    preview: '预览', download: '下载', delete: '删除', missingItemsTitle: '缺失项目',
    closedBanner: '资料提交已截止，当前内容无法修改。',
    partName: '型号', spec: '规格', material: '材质', width: '宽(mm)', depth: '长(mm)', height: '高/厚(mm)',
    qty: '数量', manufacturer: '制造商', remarkCol: '备注', unit: '单位',
    reasonRequired: '必填', reasonFormat: '格式不正确', reasonMismatch: '数值不一致', reasonNoKorean: '需要韩语确认值',
  },
  en: {
    loading: 'Loading...', notFound: 'Invalid link.',
    saveDraft: 'Save Draft', submit: 'Submit', saving: 'Saving...', submitting: 'Submitting...',
    savedAt: 'Saved', submitSuccess: 'Submission completed.', submitFailed: 'Cannot submit — please check the items below.',
    required: 'Required', testCategory: 'Test Category', baseModelInfo: 'Base Model Info (required for derived/changed)',
    derivedChangeItems: 'Derived Model & Component Change', displayFields: 'Display Items', converterType: 'Converter Usage',
    fixtureParts: 'Fixture Component List', converterParts: 'Converter Internal Component List (Integrated Converter Only)',
    multiComponent: 'Multiple Component Registration', attachments: 'Attachments', remark: 'Notes / Requests',
    submitterName: 'Submitter Name', addRow: 'Add Row', removeRow: 'Remove',
    uploadHint: 'Click or drag to upload PDF', uploading: 'Uploading...', fileDesc: 'File description',
    preview: 'Preview', download: 'Download', delete: 'Delete', missingItemsTitle: 'Missing Items',
    closedBanner: 'This submission has been closed and can no longer be edited.',
    partName: 'Model No.', spec: 'Spec', material: 'Material', width: 'Width(mm)', depth: 'Depth(mm)', height: 'Height/Thk(mm)',
    qty: 'Qty', manufacturer: 'Manufacturer', remarkCol: 'Remark', unit: 'Unit',
    reasonRequired: 'Required', reasonFormat: 'Invalid format', reasonMismatch: 'Values do not match', reasonNoKorean: 'Korean confirmed value needed',
  },
};

interface ItemImage { url: string; filename: string; originalName: string; size: number }
interface ComponentItemUI {
  id: string; listType: string; rowKey: string | null; partName: string; modelName: string; specText: string;
  material: string; widthMm: string; depthMm: string; heightMm: string; qty: string; manufacturer: string; remark: string;
}
interface AttachmentUI { id: string; categoryKey: string; originalFilename: string; sizeBytes: number; description?: string; createdAt: string }
interface ValidationIssue { key: string; kind: string; reasonKey: string }

function t(i18n: I18nText, lang: Lang) { return i18n[lang]; }

const REASON_LABEL_KEY: Record<string, string> = {
  required: 'reasonRequired', format: 'reasonFormat', mismatch: 'reasonMismatch', no_korean_value: 'reasonNoKorean',
};

function LabeledInput({ label, required, value, onChange, onBlur, error, placeholder }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className={cn('w-full h-9 rounded-md border bg-background px-3 text-sm', error ? 'border-red-400 ring-1 ring-red-300' : 'border-input')} />
    </div>
  );
}

export default function SupplierFormPage() {
  const { token } = useParams<{ token: string }>();
  const [lang, setLang] = useState<Lang>('zh');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [projectMeta, setProjectMeta] = useState<{ productName: string; supplierName: string; dueDate?: string; status: string } | null>(null);
  const [converterType, setConverterType] = useState<ConverterType | ''>('');
  const [testCategories, setTestCategories] = useState<string[]>([]);
  const [derivedChecks, setDerivedChecks] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [componentItems, setComponentItems] = useState<ComponentItemUI[]>([]);
  const [attachments, setAttachments] = useState<AttachmentUI[]>([]);
  const [submitterName, setSubmitterName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const firstErrorRef = useRef<HTMLDivElement | null>(null);

  const closed = projectMeta?.status === 'closed';
  const ui = UI[lang];

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/supplier-form/${token}`).then(async r => {
      if (!r.ok) { setNotFound(true); return; }
      const j = await r.json();
      const d = j.data;
      setProjectMeta(d.project);
      setLang((d.project.defaultLanguage as Lang) || 'zh');
      setConverterType(d.converterType || '');
      setValues(Object.fromEntries(Object.entries(d.formData || {}).map(([k, v]: [string, any]) => [k, v.original || ''])));
      setComponentItems((d.componentItems || []).map((c: any) => ({
        id: c.id, listType: c.listType, rowKey: c.rowKey, partName: c.partName || '', modelName: c.modelName || '',
        specText: c.specText || '', material: c.material || '', widthMm: c.widthMm || '', depthMm: c.depthMm || '',
        heightMm: c.heightMm || '', qty: c.qty || '', manufacturer: c.manufacturer || '', remark: c.remark || '',
      })));
      setAttachments(d.attachments || []);
    }).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [token]);
  useEffect(load, [load]);

  const saveDraft = async (silent = false) => {
    if (closed) return;
    if (!silent) setSaving(true);
    try {
      const r = await fetch(`/api/supplier-form/${token}/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ converterType: converterType || null, testCategories, derivedChangeChecks: derivedChecks, formData: values, lang }),
      });
      if (r.ok) setSavedAt(new Date().toLocaleTimeString());
    } finally { if (!silent) setSaving(false); }
  };

  const setValue = (key: string, v: string) => setValues(s => ({ ...s, [key]: v }));

  const submit = async () => {
    if (closed) return;
    if (!submitterName.trim()) { alert(lang === 'ko' ? '제출자 이름을 입력해주세요.' : lang === 'zh' ? '请输入提交人姓名。' : 'Please enter submitter name.'); return; }
    setSubmitting(true);
    setIssues(null);
    try {
      await saveDraft(true);
      const r = await fetch(`/api/supplier-form/${token}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submitterName, lang }),
      });
      const j = await r.json();
      if (!r.ok) {
        setIssues(j.issues || []);
        setTimeout(() => firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        return;
      }
      alert(ui.submitSuccess);
      load();
    } finally { setSubmitting(false); }
  };

  const issueMap = new Set((issues || []).map(i => i.key));
  const hasIssue = (key: string) => issueMap.has(key);

  const addComponent = async (listType: string) => {
    const r = await fetch(`/api/supplier-form/${token}/components`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listType }) });
    if (r.ok) load();
  };
  const updateComponent = (id: string, patch: Partial<ComponentItemUI>) => {
    setComponentItems(items => items.map(it => it.id === id ? { ...it, ...patch } : it));
  };
  const persistComponent = async (item: ComponentItemUI) => {
    await fetch(`/api/supplier-form/${token}/components/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partName: item.partName, modelName: item.modelName, specText: item.specText, material: item.material, widthMm: item.widthMm, depthMm: item.depthMm, heightMm: item.heightMm, qty: item.qty, manufacturer: item.manufacturer, remark: item.remark }),
    });
  };
  const removeComponent = async (id: string) => {
    const r = await fetch(`/api/supplier-form/${token}/components/${id}`, { method: 'DELETE' });
    if (r.ok) setComponentItems(items => items.filter(it => it.id !== id));
  };

  const uploadFile = async (categoryKey: string, file: File) => {
    setUploadingKey(categoryKey);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categoryKey', categoryKey);
      const r = await fetch(`/api/supplier-form/${token}/upload`, { method: 'POST', body: fd });
      const j = await r.json();
      if (r.ok) setAttachments(a => [...a, j.data]);
      else alert(j.error);
    } finally { setUploadingKey(null); }
  };
  const removeFile = async (id: string) => {
    const r = await fetch(`/api/supplier-form/${token}/files/${id}`, { method: 'DELETE' });
    if (r.ok) setAttachments(a => a.filter(x => x.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (notFound || !projectMeta) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">{UI.ko.notFound}</div>;

  const fixtureRows = componentItems.filter(c => c.listType === 'fixture_part');
  const converterRows = componentItems.filter(c => c.listType === 'converter_part');
  const multiRows = componentItems.filter(c => c.listType === 'multi_component');
  const visibleCategories = converterType ? getVisibleAttachmentCategories(converterType) : [];

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-border px-4 py-3 flex items-center gap-3">
        <FileText className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{projectMeta.productName}</div>
          <div className="text-xs text-muted-foreground truncate">{projectMeta.supplierName}{projectMeta.dueDate ? ` · Due ${projectMeta.dueDate}` : ''}</div>
        </div>
        <div className="ml-auto flex gap-1">
          {(['zh', 'en', 'ko'] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)} className={cn('px-2.5 py-1 text-xs rounded-md border', lang === l ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>
              {l === 'zh' ? '中文' : l === 'en' ? 'English' : '한국어'}
            </button>
          ))}
        </div>
      </div>

      {closed && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />{ui.closedBanner}
        </div>
      )}

      {issues && issues.length > 0 && (
        <div ref={firstErrorRef} className="bg-red-50 border border-red-200 rounded-lg mx-4 mt-4 p-3 text-xs text-red-700">
          <div className="font-semibold mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{ui.missingItemsTitle} ({issues.length})</div>
          <ul className="list-disc list-inside space-y-0.5">
            {issues.map((it, i) => <li key={i}>{it.key} — {REASON_LABEL_KEY[it.reasonKey] ? ui[REASON_LABEL_KEY[it.reasonKey]] : it.reasonKey}</li>)}
          </ul>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
        {/* 시험 구분 */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">{ui.testCategory}</h3>
          <div className="flex flex-wrap gap-2">
            {TEST_CATEGORY_OPTIONS.map(opt => (
              <label key={opt.key} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 cursor-pointer">
                <input type="checkbox" disabled={closed} checked={testCategories.includes(opt.key)}
                  onChange={e => setTestCategories(prev => e.target.checked ? [...prev, opt.key] : prev.filter(k => k !== opt.key))} />
                {t(opt.label, lang)}
              </label>
            ))}
          </div>
        </section>

        {/* 기본모델 정보 */}
        {(testCategories.includes('derived') || testCategories.includes('part_change')) && (
          <section className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">{ui.baseModelInfo}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BASE_MODEL_INFO_FIELDS.map(f => (
                <LabeledInput key={f.key} label={t(f.label, lang)} required value={values[f.key] || ''} onChange={v => setValue(f.key, v)} onBlur={() => saveDraft(true)} error={hasIssue(f.key)} />
              ))}
            </div>
          </section>
        )}

        {/* 파생/변경 항목 */}
        {(testCategories.includes('derived') || testCategories.includes('part_change')) && (
          <section className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">{ui.derivedChangeItems}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DERIVED_CHANGE_ITEMS.map(item => (
                <label key={item.key} className="flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 cursor-pointer">
                  <input type="checkbox" disabled={closed} checked={!!derivedChecks[item.key]}
                    onChange={e => setDerivedChecks(prev => ({ ...prev, [item.key]: e.target.checked }))} />
                  {t(item.label, lang)}
                </label>
              ))}
            </div>
          </section>
        )}

        {/* 표시사항 */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">{ui.displayFields}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DISPLAY_FIELDS.filter(f => f.key !== 'originMarking' && f.key !== 'ledPackageArrayTotal').map(f => (
              <LabeledInput key={f.key} label={t(f.label, lang)} required={f.required} value={values[f.key] || ''}
                onChange={v => setValue(f.key, v)} onBlur={() => saveDraft(true)} error={hasIssue(f.key)} />
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t(DISPLAY_FIELDS.find(f => f.key === 'originMarking')!.label, lang)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ORIGIN_MARKING_SUBFIELDS.map(k => (
                <LabeledInput key={k} label={k} required value={values[k] || ''} onChange={v => setValue(k, v)} onBlur={() => saveDraft(true)} error={hasIssue(k)} />
              ))}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t(DISPLAY_FIELDS.find(f => f.key === 'ledPackageArrayTotal')!.label, lang)}</p>
            <div className="grid grid-cols-3 gap-3">
              {LED_ARRAY_SUBFIELDS.map(k => (
                <LabeledInput key={k} label={k} required value={values[k] || ''} onChange={v => setValue(k, v)} onBlur={() => saveDraft(true)} error={hasIssue(k)} />
              ))}
            </div>
          </div>
        </section>

        {/* 컨버터 사용 여부 */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">{ui.converterType}<span className="text-red-500 ml-0.5">*</span></h3>
          <div ref={hasIssue('converterType') ? firstErrorRef : undefined} className={cn('flex flex-wrap gap-2', hasIssue('converterType') && 'ring-1 ring-red-300 rounded-lg p-1')}>
            {(Object.keys(CONVERTER_TYPE_LABELS) as ConverterType[]).map(ct => (
              <label key={ct} className={cn('flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 cursor-pointer', converterType === ct && 'border-primary bg-primary/5')}>
                <input type="radio" name="converterType" disabled={closed} checked={converterType === ct} onChange={() => { setConverterType(ct); }} />
                {t(CONVERTER_TYPE_LABELS[ct], lang)}
              </label>
            ))}
          </div>
        </section>

        {/* 등기구 부품 리스트 */}
        <section className="bg-white border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">{ui.fixtureParts}</h3>
            <Button size="sm" variant="outline" disabled={closed} onClick={() => addComponent('fixture_part')} className="gap-1 h-7 text-xs"><Plus className="w-3 h-3" />{ui.addRow}</Button>
          </div>
          <ComponentTable items={fixtureRows} ui={ui} closed={closed} onChange={updateComponent} onBlurSave={persistComponent} onRemove={removeComponent}
            rowLabel={(c) => FIXTURE_PART_FIXED_ROWS.find(r => r.rowKey === c.rowKey)?.label[lang] || c.rowKey || ''} />
        </section>

        {/* 컨버터 내부 부품 (일체형만) */}
        {converterType === 'integrated' && (
          <section className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">{ui.converterParts}</h3>
              <Button size="sm" variant="outline" disabled={closed} onClick={() => addComponent('converter_part')} className="gap-1 h-7 text-xs"><Plus className="w-3 h-3" />{ui.addRow}</Button>
            </div>
            <ComponentTable items={converterRows} ui={ui} closed={closed} onChange={updateComponent} onBlurSave={persistComponent} onRemove={removeComponent} />
          </section>
        )}

        {/* 복수부품 */}
        <section className="bg-white border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">{ui.multiComponent}</h3>
            <Button size="sm" variant="outline" disabled={closed} onClick={() => addComponent('multi_component')} className="gap-1 h-7 text-xs"><Plus className="w-3 h-3" />{ui.addRow}</Button>
          </div>
          <ComponentTable items={multiRows} ui={ui} closed={closed} onChange={updateComponent} onBlurSave={persistComponent} onRemove={removeComponent} />
        </section>

        {/* 첨부파일 */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">{ui.attachments}</h3>
          {!converterType ? (
            <p className="text-xs text-muted-foreground">{ui.converterType} 항목을 먼저 선택하세요.</p>
          ) : (
            <div className="space-y-3">
              {visibleCategories.map(cat => {
                const files = attachments.filter(a => a.categoryKey === cat.key);
                const missing = hasIssue(cat.key);
                return (
                  <div key={cat.key} ref={missing ? firstErrorRef : undefined} className={cn('border rounded-lg p-3', missing && 'border-red-400 ring-1 ring-red-300')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">{t(cat.label, lang)}{cat.required === true && <span className="text-red-500 ml-0.5">*</span>}</span>
                    </div>
                    {files.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {files.map(f => (
                          <div key={f.id} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5">
                            <a href={`/api/supplier-form/${token}/files/${f.id}`} target="_blank" rel="noreferrer" className="truncate hover:underline">{f.originalFilename}</a>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-muted-foreground">{(f.sizeBytes / 1024).toFixed(0)}KB</span>
                              {!closed && <button onClick={() => removeFile(f.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!closed && (
                      <label className="flex items-center justify-center gap-1.5 border border-dashed rounded-lg py-2.5 text-xs text-muted-foreground cursor-pointer hover:border-primary hover:text-primary">
                        {uploadingKey === cat.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {ui.uploadHint}
                        <input type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(cat.key, f); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 요청사항 */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">{ui.remark}</h3>
          <textarea disabled={closed} className="w-full min-h-[80px] text-sm rounded-md border border-input bg-background px-3 py-2"
            value={values.remark || ''} onChange={e => setValue('remark', e.target.value)} onBlur={() => saveDraft(true)} />
        </section>
      </div>

      {!closed && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-border p-3 flex items-center gap-2 max-w-3xl mx-auto">
          <input value={submitterName} onChange={e => setSubmitterName(e.target.value)} placeholder={ui.submitterName}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          {savedAt && <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:flex items-center gap-1"><Check className="w-3 h-3" />{ui.savedAt} {savedAt}</span>}
          <Button variant="outline" onClick={() => saveDraft(false)} disabled={saving} className="gap-1 shrink-0">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{ui.saveDraft}
          </Button>
          <Button onClick={submit} disabled={submitting} className="gap-1 shrink-0">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{ui.submit}
          </Button>
        </div>
      )}
    </div>
  );
}

function ComponentTable({ items, ui, closed, onChange, onBlurSave, onRemove, rowLabel }: {
  items: ComponentItemUI[]; ui: Record<string, string>; closed: boolean;
  onChange: (id: string, patch: Partial<ComponentItemUI>) => void;
  onBlurSave: (item: ComponentItemUI) => void;
  onRemove: (id: string) => void;
  rowLabel?: (item: ComponentItemUI) => string;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">항목이 없습니다.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[760px]">
        <thead className="bg-muted/50">
          <tr>
            {rowLabel && <th className="text-left px-2 py-1.5">항목</th>}
            <th className="text-left px-2 py-1.5">{ui.partName}</th>
            <th className="text-left px-2 py-1.5">{ui.spec}</th>
            <th className="text-left px-2 py-1.5">{ui.material}</th>
            <th className="text-left px-2 py-1.5">{ui.width}</th>
            <th className="text-left px-2 py-1.5">{ui.depth}</th>
            <th className="text-left px-2 py-1.5">{ui.height}</th>
            <th className="text-left px-2 py-1.5">{ui.qty}</th>
            <th className="text-left px-2 py-1.5">{ui.manufacturer}</th>
            <th className="text-left px-2 py-1.5">{ui.remarkCol}</th>
            {!closed && <th />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map(item => (
            <tr key={item.id}>
              {rowLabel && <td className="px-2 py-1.5 font-medium whitespace-nowrap">{rowLabel(item)}</td>}
              {(['modelName', 'specText', 'material', 'widthMm', 'depthMm', 'heightMm', 'qty', 'manufacturer', 'remark'] as const).map(field => (
                <td key={field} className="px-1 py-1">
                  <input disabled={closed} value={item[field]} onChange={e => onChange(item.id, { [field]: e.target.value })}
                    onBlur={() => onBlurSave(item)} className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs" />
                </td>
              ))}
              {!closed && <td className="px-1"><button onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
