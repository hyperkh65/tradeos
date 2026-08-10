'use client';

import { AppHeader } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Plus, Search, X, Loader2, Pencil, Trash2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Product } from '@/types';

const CATEGORIES = ['조명', '가전', '전자', '생활용품', '산업용품', '기타'];

function ProductModal({ item, onClose, onSave }: { item?: Product | null; onClose: () => void; onSave: () => void }) {
  const ex = item as any;
  const [form, setForm] = useState({
    code: item?.code || '',
    nameKo: item?.nameKo || '',
    nameEn: item?.nameEn || '',
    category: item?.category || '',
    supplierName: item?.supplierName || '',
    maker: ex?.maker || '',
    purchasePrice: item?.purchasePrice?.toString() || '',
    sellingPrice: item?.sellingPrice?.toString() || '',
    currency: item?.currency || 'USD',
    moq: item?.moq?.toString() || '',
    leadTimeDays: item?.leadTimeDays?.toString() || '',
    hsCode: item?.hsCode || '',
    countryOfOrigin: item?.countryOfOrigin || '중국',
    imageUrl: ex?.imageUrl || '',
    detail: ex?.detail || '',
    voltage: ex?.voltage || '',
    watts: ex?.watts || '',
    cct: ex?.cct || '',
    inputA: ex?.inputA || '',
    outputV: ex?.outputV || '',
    outputA: ex?.outputA || '',
    material: ex?.material || '',
    sizeSpec: ex?.sizeSpec || '',
    converter: ex?.converter || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameKo || !form.code) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
        moq: form.moq ? Number(form.moq) : undefined,
        leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
      };
      if (item) {
        await fetch(`/api/products/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '제품 수정' : '제품 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 기본 정보 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">기본 정보</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">품번 *</label>
                  <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="P26-001" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">선택</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 (한글) *</label>
                <Input value={form.nameKo} onChange={e => setForm(f => ({ ...f, nameKo: e.target.value }))} placeholder="LED 패널 40W" required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 (영문)</label>
                <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="LED Panel 40W" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체</label>
                  <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Ningbo Alpha Lighting" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">제조사</label>
                  <Input value={form.maker} onChange={e => setForm(f => ({ ...f, maker: e.target.value }))} placeholder="Philips" />
                </div>
              </div>
            </div>
          </div>

          {/* 사양 */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">사양 (Spec)</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">상세 사양</label>
                <Input value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} placeholder="1200x600mm, IP44, IK08" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">전압 (Voltage)</label>
                  <Input value={form.voltage} onChange={e => setForm(f => ({ ...f, voltage: e.target.value }))} placeholder="220V" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">와트 (Watts)</label>
                  <Input value={form.watts} onChange={e => setForm(f => ({ ...f, watts: e.target.value }))} placeholder="40W" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">CCT</label>
                  <Input value={form.cct} onChange={e => setForm(f => ({ ...f, cct: e.target.value }))} placeholder="4000K" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">입력전류 (InputA)</label>
                  <Input value={form.inputA} onChange={e => setForm(f => ({ ...f, inputA: e.target.value }))} placeholder="0.18A" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">출력전압 (OutputV)</label>
                  <Input value={form.outputV} onChange={e => setForm(f => ({ ...f, outputV: e.target.value }))} placeholder="24V" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">출력전류 (OutputA)</label>
                  <Input value={form.outputA} onChange={e => setForm(f => ({ ...f, outputA: e.target.value }))} placeholder="1.67A" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">재질 (Material)</label>
                  <Input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="알루미늄" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">크기 (Size)</label>
                  <Input value={form.sizeSpec} onChange={e => setForm(f => ({ ...f, sizeSpec: e.target.value }))} placeholder="1200x600x70mm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">컨버터 (Converter)</label>
                  <Input value={form.converter} onChange={e => setForm(f => ({ ...f, converter: e.target.value }))} placeholder="내장" />
                </div>
              </div>
            </div>
          </div>

          {/* 가격 / 거래 */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">가격 / 거래</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">구매단가</label>
                  <Input type="number" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} placeholder="17.50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option>USD</option><option>EUR</option><option>CNY</option><option>KRW</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">판매단가 (KRW)</label>
                  <Input type="number" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} placeholder="32000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">MOQ</label>
                  <Input type="number" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} placeholder="200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">리드타임(일)</label>
                  <Input type="number" value={form.leadTimeDays} onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} placeholder="45" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">원산지</label>
                  <Input value={form.countryOfOrigin} onChange={e => setForm(f => ({ ...f, countryOfOrigin: e.target.value }))} placeholder="중국" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">HS Code</label>
                <Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10" />
              </div>
            </div>
          </div>

          {/* 이미지 */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">이미지</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">이미지 URL</label>
              <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
              {form.imageUrl && (
                <div className="mt-2 border rounded-lg p-2 bg-muted/30 flex items-center justify-center h-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="미리보기" className="max-h-full max-w-full object-contain"
                    onError={e => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: Product | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/products').then(r => r.json());
    if (res.data) setProducts(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('제품을 삭제하시겠습니까?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = products.filter(p =>
    p.nameKo.includes(search) || (p.nameEn ?? '').includes(search) || p.code.includes(search) || (p.supplierName ?? '').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="제품" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="제품명, 코드 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">제품 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-16">사진</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">코드</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">제품명</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">카테고리</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">공급업체</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">사양</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">구매단가</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">MOQ</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => {
                    const ex = p as any;
                    const specParts = [ex.voltage, ex.watts, ex.cct].filter(Boolean);
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="w-12 h-12 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                            {ex.imageUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={ex.imageUrl} alt={p.nameKo} className="w-full h-full object-cover"
                                onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.removeAttribute('style'); }} />
                            ) : null}
                            <ImageIcon className="w-5 h-5 text-muted-foreground/40" style={ex.imageUrl ? { display: 'none' } : {}} />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{p.nameKo}</p>
                          {p.nameEn && <p className="text-xs text-muted-foreground">{p.nameEn}</p>}
                          {ex.detail && <p className="text-xs text-muted-foreground/70 truncate max-w-[200px]">{ex.detail}</p>}
                        </td>
                        <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{p.category ?? '-'}</Badge></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{p.supplierName ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{specParts.length > 0 ? specParts.join(' / ') : '-'}</td>
                        <td className="px-4 py-3 text-right text-xs font-mono">{p.purchasePrice ? `${p.currency} ${Number(p.purchasePrice).toFixed(2)}` : '-'}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">{p.moq ? Number(p.moq).toLocaleString() : '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: p })}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" />제품이 없습니다.</div>}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden grid grid-cols-2 gap-3">
              {filtered.map(p => {
                const ex = p as any;
                const specParts = [ex.voltage, ex.watts, ex.cct].filter(Boolean);
                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="aspect-square bg-muted/30 flex items-center justify-center relative">
                      {ex.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={ex.imageUrl} alt={p.nameKo} className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                      )}
                      <div className="absolute top-1.5 right-1.5 flex gap-1">
                        <button onClick={() => setModal({ open: true, item: p })} className="bg-white/90 rounded-full p-1 shadow"><Pencil className="w-3 h-3 text-gray-600" /></button>
                        <button onClick={() => handleDelete(p.id)} className="bg-white/90 rounded-full p-1 shadow"><Trash2 className="w-3 h-3 text-red-500" /></button>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-mono text-muted-foreground">{p.code}</p>
                      <p className="font-semibold text-sm mt-0.5 line-clamp-2">{p.nameKo}</p>
                      {specParts.length > 0 && <p className="text-xs text-muted-foreground mt-1">{specParts.join(' / ')}</p>}
                      {p.purchasePrice && <p className="text-xs font-semibold mt-1">{p.currency} {Number(p.purchasePrice).toFixed(2)}</p>}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">제품이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <ProductModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
