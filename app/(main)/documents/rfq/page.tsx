'use client';
import { useState, useEffect, useCallback } from 'react';
import { LogoMark } from '@/components/brand/logo-mark';
import { Button } from '@/components/ui/button';
import { DocumentDeleteButton } from '@/components/documents/DocumentDeleteButton';
import {
  Plus, FolderOpen, Save, FileSpreadsheet, FileType2, Printer, X, Loader2,
  MapPin, Phone, Mail, Search, FilePlus2, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadFile } from '@/lib/tauri-print';

interface ItemImage { url: string; filename: string; originalName: string; size: number }
interface RfqItem {
  name: string; specification: string; qty: number; unit: string; remark: string;
  unitPrice: number; images: ItemImage[];
}
interface RfqData {
  date: string; validUntil: string; currency: string; paymentTerms: string;
  supplierName: string; supplierContact: string; supplierEmail: string; supplierPhone: string; supplierAddress: string;
  items: RfqItem[]; remark: string;
}
interface DocRow {
  id: string; businessId: string; title: string; status: string;
  data: RfqData; createdAt: string; updatedAt: string;
}
interface CompanyInfo { name: string; address: string; tel: string; fax: string; email: string; bizNo: string }
interface Company { id: string; name: string; type: string; email?: string; phone?: string; address?: string; contactPerson?: string }
interface Product { id: string; nameKo: string; sizeSpec?: string; purchasePrice?: number; imageUrl?: string }

const CURRENCIES = ['USD', 'CNY', 'KRW', 'EUR', 'JPY'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const emptyItem = (): RfqItem => ({ name: '', specification: '', qty: 0, unit: 'EA', remark: '', unitPrice: 0, images: [] });
const emptyData = (): RfqData => ({
  date: todayStr(), validUntil: addDays(30), currency: 'USD', paymentTerms: '',
  supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '', supplierAddress: '',
  items: [emptyItem()], remark: '',
});

function FieldInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground tracking-wide">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-sm py-1 border-0 border-b border-border bg-transparent focus:outline-none focus:border-primary"
      />
    </div>
  );
}

export default function RfqPage() {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [brand, setBrand] = useState({ logoText: 'YnK' });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [list, setList] = useState<DocRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selected, setSelected] = useState<DocRow | null>(null);
  const [data, setData] = useState<RfqData>(emptyData());
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings/company').then(r => r.json()).then(j => setCompany(j.data)).catch(() => {});
    fetch('/api/settings/brand').then(r => r.json()).then(j => { if (j.data) setBrand(j.data); }).catch(() => {});
    fetch('/api/companies').then(r => r.json()).then(j => setCompanies(Array.isArray(j.data) ? j.data : [])).catch(() => {});
    fetch('/api/products').then(r => r.json()).then(j => setProducts(Array.isArray(j.data) ? j.data : [])).catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoadingList(true);
    fetch('/api/documents?type=rfq').then(r => r.json()).then(j => setList(j.data || [])).finally(() => setLoadingList(false));
  }, []);

  const openNew = () => { setSelected(null); setData(emptyData()); setListOpen(false); };
  const openDoc = (d: DocRow) => {
    setSelected(d);
    setData({
      ...emptyData(), ...d.data,
      items: (d.data.items?.length ? d.data.items : [emptyItem()]).map(it => ({ ...emptyItem(), ...it })),
    });
    setListOpen(false);
  };

  const handleSave = async () => {
    if (!data.supplierName.trim()) { alert('공급사(TO) 회사명을 입력해주세요.'); return; }
    if (!data.items.some(i => i.name.trim())) { alert('품목을 1개 이상 입력해주세요.'); return; }
    setSaving(true);
    const title = `${data.supplierName} 견적의뢰서`;
    try {
      if (selected) {
        const r = await fetch(`/api/documents/${selected.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, data, status: 'issued' }),
        });
        const j = await r.json();
        if (!r.ok) { alert(j.error || '저장 실패'); return; }
        setSelected(j.data);
      } else {
        const r = await fetch('/api/documents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType: 'rfq', title, data, status: 'issued' }),
        });
        const j = await r.json();
        if (!r.ok) { alert(j.error || '저장 실패'); return; }
        setSelected(j.data);
      }
    } finally { setSaving(false); }
  };

  const applySupplier = (name: string) => {
    const co = companies.find(c => c.name === name);
    setData(d => ({
      ...d, supplierName: name,
      supplierContact: co?.contactPerson || d.supplierContact,
      supplierEmail: co?.email || d.supplierEmail,
      supplierPhone: co?.phone || d.supplierPhone,
      supplierAddress: co?.address || d.supplierAddress,
    }));
  };

  const updateItem = (idx: number, patch: Partial<RfqItem>) => {
    setData(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };
  const addItem = () => setData(d => ({ ...d, items: [...d.items, emptyItem()] }));
  const removeItem = (idx: number) => setData(d => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, i) => i !== idx) : d.items }));

  // 기존에 등록된 제품을 선택하면 규격/기존단가/제품사진을 그대로 가져와 채워준다
  const applyProduct = (idx: number, name: string) => {
    const prod = products.find(p => p.nameKo === name);
    if (!prod) { updateItem(idx, { name }); return; }
    updateItem(idx, {
      name,
      specification: prod.sizeSpec || data.items[idx].specification,
      unitPrice: prod.purchasePrice || data.items[idx].unitPrice,
      images: prod.imageUrl && data.items[idx].images.length === 0
        ? [{ url: prod.imageUrl, filename: 'from-product', originalName: `${prod.nameKo} (기존 제품 사진)`, size: 0 }]
        : data.items[idx].images,
    });
  };

  const uploadItemImage = async (idx: number, file: File) => {
    if (!selected) { alert('먼저 저장한 뒤 사진을 첨부할 수 있습니다.'); return; }
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('itemIndex', String(idx));
      const res = await fetch(`/api/documents/${selected.id}/upload`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) updateItem(idx, { images: [...data.items[idx].images, j.data] });
      else alert(j.error || '업로드 실패');
    } catch (err) {
      alert('업로드 중 오류가 발생했습니다.\n' + (err instanceof Error ? err.message : String(err)));
    } finally { setUploadingIdx(null); }
  };

  const removeItemImage = async (idx: number, img: ItemImage) => {
    if (img.filename === 'from-product') { updateItem(idx, { images: data.items[idx].images.filter(i => i !== img) }); return; }
    if (!selected) return;
    const res = await fetch(`/api/documents/${selected.id}/files/${idx}/${img.filename}`, { method: 'DELETE' });
    if (res.ok) updateItem(idx, { images: data.items[idx].images.filter(i => i.filename !== img.filename) });
    else alert('삭제 실패');
  };

  const exportDoc = (kind: 'excel' | 'word' | 'pdf') => {
    if (!selected) { alert('먼저 저장한 뒤 이용할 수 있습니다.'); return; }
    downloadFile(`/api/documents/${selected.id}/${kind}`);
  };

  const filteredList = list.filter(d => !listSearch || d.title.includes(listSearch) || d.businessId.includes(listSearch));
  const supplierCompanies = companies.filter(c => c.type === '공급업체');

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/40">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-14 bg-slate-900 text-white shrink-0">
        <span className="font-semibold text-sm mr-auto truncate">
          견적 의뢰서 {selected ? `· ${selected.businessId}` : '(신규)'}
        </span>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1 bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white" onClick={openNew}>
          <FilePlus2 className="w-3.5 h-3.5" />새 견적서
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1 bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white" onClick={() => { setListOpen(true); loadList(); }}>
          <FolderOpen className="w-3.5 h-3.5" />목록
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}저장
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={addItem}>
          <Plus className="w-3.5 h-3.5" />제품 추가
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => exportDoc('excel')}>
          <FileSpreadsheet className="w-3.5 h-3.5" />Excel
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => exportDoc('word')}>
          <FileType2 className="w-3.5 h-3.5" />Word
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => exportDoc('pdf')}>
          <Printer className="w-3.5 h-3.5" />PDF
        </Button>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-border p-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-6 mb-2">
            <div>
              <div className="flex items-center gap-3">
                <LogoMark text={brand.logoText} size={44} />
                <div>
                  <div className="text-lg font-bold leading-tight">{company?.name || ''}</div>
                  <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Global Trading</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-3">
                <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 shrink-0" />{company?.address}</div>
                <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 shrink-0" />{company?.tel}{company?.fax ? ` | Fax ${company.fax}` : ''}</div>
                <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" />{company?.email}</div>
                <div>사업자번호: {company?.bizNo}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-blue-700">견적 의뢰서</div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-3">REQUEST FOR QUOTATION</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-[11px] text-muted-foreground">Quote No.</span>
                  <span className="text-sm font-bold">{selected?.businessId || '(저장 시 자동부여)'}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-[11px] text-muted-foreground">Date</span>
                  <input type="date" value={data.date} onChange={e => setData(d => ({ ...d, date: e.target.value }))}
                    className="text-sm text-right border-0 border-b border-border bg-transparent focus:outline-none focus:border-primary" />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-[11px] text-muted-foreground">Valid Until</span>
                  <input type="date" value={data.validUntil} onChange={e => setData(d => ({ ...d, validUntil: e.target.value }))}
                    className="text-sm text-right border-0 border-b border-border bg-transparent focus:outline-none focus:border-primary" />
                </div>
              </div>
            </div>
          </div>

          <div className="h-0.5 bg-blue-600 my-6" />

          {/* FROM / TO */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-[11px] font-bold text-blue-700 tracking-wide mb-2">FROM (구매자)</div>
              <div className="font-bold mb-1">{company?.name}</div>
              <div className="text-xs text-muted-foreground">{company?.address}</div>
              <div className="text-xs text-muted-foreground">Tel: {company?.tel}{company?.fax ? ` | Fax: ${company.fax}` : ''}</div>
              <div className="text-xs text-muted-foreground">Email: {company?.email}</div>
              <div className="text-xs text-muted-foreground">사업자번호: {company?.bizNo}</div>
            </div>
            <div className="border border-border rounded-lg p-4">
              <div className="text-[11px] font-bold text-muted-foreground tracking-wide mb-3">TO (공급사)</div>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground tracking-wide">회사명 (COMPANY)</label>
                  <input list="rfq-suppliers" value={data.supplierName} onChange={e => applySupplier(e.target.value)}
                    className="w-full text-sm py-1 border-0 border-b border-border bg-transparent focus:outline-none focus:border-primary" placeholder="공급사명 입력 또는 목록 선택" />
                  <datalist id="rfq-suppliers">
                    {supplierCompanies.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
                <FieldInput label="담당자 (CONTACT)" value={data.supplierContact} onChange={v => setData(d => ({ ...d, supplierContact: v }))} />
                <FieldInput label="이메일 (EMAIL)" value={data.supplierEmail} onChange={v => setData(d => ({ ...d, supplierEmail: v }))} />
                <FieldInput label="전화 (TEL)" value={data.supplierPhone} onChange={v => setData(d => ({ ...d, supplierPhone: v }))} />
                <FieldInput label="주소 (ADDRESS)" value={data.supplierAddress} onChange={v => setData(d => ({ ...d, supplierAddress: v }))} />
              </div>
            </div>
          </div>

          {/* Currency / Payment terms */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground tracking-wide">화폐단위 (CURRENCY)</label>
              <select value={data.currency} onChange={e => setData(d => ({ ...d, currency: e.target.value }))}
                className="w-full text-sm py-1.5 px-2 rounded border border-input bg-background">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <FieldInput label="지급 결제조건 (PAYMENT TERMS)" value={data.paymentTerms} onChange={v => setData(d => ({ ...d, paymentTerms: v }))} />
          </div>

          {/* Items */}
          <div className="space-y-3">
            {data.items.map((it, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-slate-900 text-white px-3 py-1.5">
                  <span className="text-xs font-semibold tracking-wide">ITEM {i + 1}</span>
                  <button type="button" onClick={() => removeItem(i)} className="text-[11px] text-red-300 hover:text-red-100 flex items-center gap-1">
                    <X className="w-3 h-3" />삭제
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-3 p-3">
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground">품목명 (등록된 제품 선택 시 규격·단가·사진 자동입력)</label>
                    <input list="rfq-products" value={it.name} onChange={e => applyProduct(i, e.target.value)} placeholder="예: LED 모듈 25W 주광색"
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                    <datalist id="rfq-products">
                      {products.map(p => <option key={p.id} value={p.nameKo} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">규격</label>
                    <input value={it.specification} onChange={e => updateItem(i, { specification: e.target.value })}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">단위</label>
                    <input value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">수량</label>
                    <input type="number" value={it.qty || ''} onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">희망단가 ({data.currency})</label>
                    <input type="number" value={it.unitPrice || ''} onChange={e => updateItem(i, { unitPrice: Number(e.target.value) || 0 })}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                  </div>
                  <div className="col-span-4">
                    <label className="text-[10px] text-muted-foreground">비고</label>
                    <input value={it.remark} onChange={e => updateItem(i, { remark: e.target.value })}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground block mb-1">제품 사진</label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {it.images.map((img, imgI) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <div key={imgI} className="relative group">
                          <img src={img.url} alt={img.originalName} className="w-9 h-9 object-cover rounded border border-border" />
                          <button type="button" onClick={() => removeItemImage(i, img)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <label className={cn('w-9 h-9 rounded border border-dashed border-border flex items-center justify-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary', !selected && 'opacity-40 cursor-not-allowed')}>
                        {uploadingIdx === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <input type="file" accept="image/*" className="hidden" disabled={!selected}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadItemImage(i, f); e.target.value = ''; }} />
                      </label>
                    </div>
                    {!selected && <p className="text-[10px] text-muted-foreground mt-1">먼저 저장한 뒤 직접 촬영한 사진을 첨부할 수 있습니다.</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.items.some(it => it.unitPrice > 0) && (
            <div className="flex justify-end mt-3">
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm">
                <span className="text-muted-foreground mr-2">희망단가 합계</span>
                <span className="font-bold text-blue-700">
                  {data.items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0).toLocaleString(data.currency === 'KRW' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 2 })} {data.currency}
                </span>
              </div>
            </div>
          )}

          {/* Remark */}
          <div className="mt-6">
            <label className="text-xs font-semibold mb-1 block">요청사항</label>
            <textarea className="w-full min-h-[80px] text-sm rounded-md border border-input bg-background px-3 py-2"
              value={data.remark} onChange={e => setData(d => ({ ...d, remark: e.target.value }))}
              placeholder="예: 최소 주문 수량, 납기, 결제조건 등 요청사항을 입력하세요." />
          </div>
        </div>
      </div>

      {/* List modal */}
      {listOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setListOpen(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-[480px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">견적 의뢰서 목록</span>
              <button onClick={() => setListOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-4 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="검색..." value={listSearch} onChange={e => setListSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : filteredList.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">작성된 견적의뢰서가 없습니다</div>
              ) : filteredList.map(d => (
                <div key={d.id}
                  className={cn('px-4 py-2.5 border-b border-border cursor-pointer hover:bg-muted/40 flex items-center gap-2', selected?.id === d.id && 'bg-blue-50')}
                  onClick={() => openDoc(d)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">{d.businessId}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{d.createdAt?.slice(0, 10)}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{d.data?.supplierName} ({d.data?.items?.length || 0}개 품목)</div>
                  </div>
                  <DocumentDeleteButton id={d.id} createdAt={d.createdAt} onDeleted={() => { if (selected?.id === d.id) openNew(); loadList(); }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
