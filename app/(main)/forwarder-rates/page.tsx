'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ship, Plus, Loader2, X, History, Pencil, Trash2, Upload, ClipboardPaste, TrendingUp } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface BreakdownItem { label: string; amount: number; currency: string }
interface ForwarderRate {
  id: string; forwarderId?: string; forwarderName: string;
  pol: string; pod: string; containerType: string; carrier?: string; rateType?: string;
  totalAmount: number; totalCurrency: string; breakdown: BreakdownItem[];
  quoteDate?: string; quoteMonth?: string; validUntil?: string; docNo?: string; contactPerson?: string;
  sourceFileUrl?: string; memo?: string; createdByName?: string;
  createdAt: string; updatedAt: string;
}
interface Lane { pol: string; pod: string; count: number; forwarderCount: number; lastUpdated: string; lastQuoteMonth?: string | null }
interface Company { id: string; name: string; type: string }
interface ForwarderSummary { forwarderId: string | null; forwarderName: string; lastQuoteDate: string; lastQuoteMonth?: string | null; laneCount: number; totalCount: number }

const CONTAINER_TYPES = ['20GP', '40GP', 'LCL'];
const CURRENCIES = ['USD', 'CNY', 'KRW', 'EUR', 'JPY'];

export default function ForwarderRatesPage() {
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [forwarders, setForwarders] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [pol, setPol] = useState('');
  const [pod, setPod] = useState('');
  const [containerType, setContainerType] = useState('');
  const [compareRows, setCompareRows] = useState<ForwarderRate[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState<{ open: boolean; item?: ForwarderRate | null }>({ open: false });
  const [historyFor, setHistoryFor] = useState<ForwarderRate | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [fileUploadOpen, setFileUploadOpen] = useState(false);
  const [bulkPrefill, setBulkPrefill] = useState<BulkPrefill | null>(null);
  const [forwarderSummaries, setForwarderSummaries] = useState<ForwarderSummary[]>([]);
  const [updatingForwarder, setUpdatingForwarder] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ KRW: 1 });
  const [fxLoading, setFxLoading] = useState(false);

  const loadLanes = useCallback(() => {
    setLoading(true);
    fetch('/api/forwarder-rates/lanes').then(r => r.json()).then(j => setLanes(j.data || [])).finally(() => setLoading(false));
  }, []);
  useEffect(loadLanes, [loadLanes]);
  useEffect(() => {
    fetch('/api/companies?type=포워더').then(r => r.json()).then(j => setForwarders(j.data || []));
  }, []);

  const loadForwarderSummaries = useCallback(() => {
    fetch('/api/forwarder-rates/forwarders').then(r => r.json()).then(j => setForwarderSummaries(j.data || []));
  }, []);
  useEffect(loadForwarderSummaries, [loadForwarderSummaries]);

  const openBulkNew = () => { setBulkPrefill(null); setBulkOpen(true); };
  const startMonthlyUpdate = async (forwarderName: string) => {
    setUpdatingForwarder(forwarderName);
    try {
      const res = await fetch(`/api/forwarder-rates/template?forwarderName=${encodeURIComponent(forwarderName)}`);
      const j = await res.json();
      if (!j.data) { alert('이전 견적을 찾을 수 없습니다.'); return; }
      setBulkPrefill({ forwarderName, totalCurrency: j.data.totalCurrency, validUntil: j.data.validUntil, contactPerson: j.data.contactPerson, previousQuoteDate: j.data.previousQuoteDate, rows: j.data.rows });
      setBulkOpen(true);
    } finally { setUpdatingForwarder(null); }
  };

  const loadCompare = useCallback(() => {
    if (!pol || !pod) { setCompareRows(null); return; }
    setCompareLoading(true);
    const qs = new URLSearchParams({ pol, pod });
    if (containerType) qs.set('containerType', containerType);
    fetch(`/api/forwarder-rates/latest?${qs}`).then(r => r.json()).then(j => setCompareRows(j.data || [])).finally(() => setCompareLoading(false));
  }, [pol, pod, containerType]);
  useEffect(loadCompare, [loadCompare]);

  const selectLane = (l: Lane) => { setPol(l.pol); setPod(l.pod); };
  const clearFilter = () => { setPol(''); setPod(''); setContainerType(''); };

  // 해상운임(USD 등)과 부대비용(KRW+USD 혼합)을 그날그날 실제 환율로 전부 원화 환산해
  // "총 얼마"까지 한 번에 계산·비교하기 위한 환율 로딩 — 기존 /api/utils/fx-rate(당일
  // 환율, 1시간 캐시)를 그대로 재사용한다(costs 페이지와 동일 패턴).
  useEffect(() => {
    const needed = new Set<string>();
    (compareRows || []).forEach(r => {
      if (r.totalCurrency !== 'KRW') needed.add(r.totalCurrency);
      r.breakdown.forEach(b => { if (b.currency !== 'KRW') needed.add(b.currency); });
    });
    const missing = Array.from(needed).filter(c => !(c in fxRates));
    if (missing.length === 0) return;
    setFxLoading(true);
    Promise.all(missing.map(c => fetch(`/api/utils/fx-rate?base=${c}&target=KRW`).then(r => r.json()).then(d => [c, d.rate as number] as const).catch(() => [c, 0] as const)))
      .then(pairs => setFxRates(prev => ({ ...prev, ...Object.fromEntries(pairs) })))
      .finally(() => setFxLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareRows]);

  const toKrw = (amount: number, currency: string) => Math.round(amount * (fxRates[currency] ?? 0));
  const grandTotalKrw = (r: ForwarderRate) => toKrw(r.totalAmount, r.totalCurrency) + r.breakdown.reduce((s, b) => s + toKrw(b.amount, b.currency), 0);
  const ratesReady = (compareRows || []).every(r => [r.totalCurrency, ...r.breakdown.map(b => b.currency)].every(c => c === 'KRW' || (fxRates[c] ?? 0) > 0));

  // 컨테이너타입이 다르면(20GP vs 40GP) 애초에 비교 대상이 아니므로, 타입별로 묶어서
  // 그 안에서만 총액(원화) 오름차순 정렬하고 "최저"도 타입별로 매긴다.
  const sortedCompareRows = ratesReady && compareRows
    ? [...compareRows].sort((a, b) => a.containerType !== b.containerType ? a.containerType.localeCompare(b.containerType) : grandTotalKrw(a) - grandTotalKrw(b))
    : compareRows;
  const minByType: Record<string, number> = {};
  if (ratesReady) {
    (compareRows || []).forEach(r => {
      const t = grandTotalKrw(r);
      if (minByType[r.containerType] === undefined || t < minByType[r.containerType]) minByType[r.containerType] = t;
    });
  }

  const polOptions = Array.from(new Set(lanes.map(l => l.pol))).sort();
  const podOptions = Array.from(new Set(lanes.map(l => l.pod))).sort();

  const removeRate = async (r: ForwarderRate) => {
    if (!confirm(`${r.forwarderName} / ${r.pol}→${r.pod} / ${r.containerType} 운임을 삭제할까요?`)) return;
    await fetch(`/api/forwarder-rates/${r.id}`, { method: 'DELETE' });
    loadLanes(); loadCompare(); loadForwarderSummaries();
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="포워더운임" icon={<Ship className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-2 justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">출발항(POL)</label>
              <Input list="fr-pol-list" value={pol} onChange={e => setPol(e.target.value.toUpperCase())} placeholder="예: SHANGHAI" className="w-40" />
              <datalist id="fr-pol-list">{polOptions.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">도착항(POD)</label>
              <Input list="fr-pod-list" value={pod} onChange={e => setPod(e.target.value.toUpperCase())} placeholder="예: INCHEON" className="w-40" />
              <datalist id="fr-pod-list">{podOptions.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">컨테이너</label>
              <select value={containerType} onChange={e => setContainerType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">전체</option>
                {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(pol || pod) && <Button type="button" variant="outline" size="sm" onClick={clearFilter}>필터 초기화</Button>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setFileUploadOpen(true)} className="gap-1.5"><Upload className="w-4 h-4" />파일 업로드</Button>
            <Button type="button" variant="outline" onClick={openBulkNew} className="gap-1.5"><ClipboardPaste className="w-4 h-4" />엑셀에서 붙여넣기</Button>
            <Button onClick={() => setModalOpen({ open: true })} className="gap-1.5"><Plus className="w-4 h-4" />운임 등록</Button>
          </div>
        </div>

        {!pol && !pod && forwarderSummaries.length > 0 && (
          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium">포워더별 이번달 갱신</div>
            <div className="divide-y">
              {forwarderSummaries.map(f => (
                <div key={f.forwarderName} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{f.forwarderName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">노선 {f.laneCount}개 · 최근 견적 {f.lastQuoteMonth || f.lastQuoteDate?.slice(0, 7)}월</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/forwarder-rates/analysis?forwarderName=${encodeURIComponent(f.forwarderName)}`}>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" />종합분석</Button>
                    </Link>
                    <Button type="button" variant="outline" size="sm" disabled={updatingForwarder === f.forwarderName}
                      onClick={() => startMonthlyUpdate(f.forwarderName)} className="gap-1.5">
                      {updatingForwarder === f.forwarderName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
                      이번달 갱신
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!pol || !pod ? (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : lanes.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-8 text-center">등록된 운임이 없습니다. &quot;운임 등록&quot;으로 첫 견적을 기록하세요.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lanes.map(l => (
                <button key={`${l.pol}-${l.pod}`} type="button" onClick={() => selectLane(l)}
                  className="text-left border rounded-xl p-4 hover:border-primary hover:shadow-sm transition-colors bg-card">
                  <div className="font-semibold text-sm">{l.pol} → {l.pod}</div>
                  <div className="text-xs text-muted-foreground mt-1">{l.forwarderCount}개 업체 · {l.count}건 · 최근 {l.lastQuoteMonth || (l.lastUpdated || '').slice(0, 7)}월</div>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium flex items-center justify-between">
              <span>{pol} → {pod}</span>
              {(compareRows?.length ?? 0) > 0 && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  {fxLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  적용환율(오늘): {Object.entries(fxRates).filter(([c]) => c !== 'KRW').map(([c, r]) => `${c} ${r ? r.toLocaleString() : '조회중'}`).join(' · ') || '-'}
                </span>
              )}
            </div>
            {compareLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : !compareRows || compareRows.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-8 text-center">이 노선에 등록된 운임이 없습니다. &quot;운임 등록&quot;으로 추가하세요.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">포워더</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">선사</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">컨테이너</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">해상운임 + 부대비용 = 총액(원화, 낮은 순)</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">견적일자</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">담당자</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!ratesReady ? (
                    <tr><td colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline-block" /> 환율 조회 중...</td></tr>
                  ) : (sortedCompareRows || []).map(r => {
                    const ocean = toKrw(r.totalAmount, r.totalCurrency);
                    const surcharge = r.breakdown.reduce((s, b) => s + toKrw(b.amount, b.currency), 0);
                    const total = ocean + surcharge;
                    const isMin = total === minByType[r.containerType];
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 align-top">
                        <td className="px-3 py-2.5 font-medium">{r.forwarderName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.carrier || '-'}</td>
                        <td className="px-3 py-2.5">{r.containerType}</td>
                        <td className="px-3 py-2.5 min-w-[300px]">
                          <div className={cn('font-semibold whitespace-nowrap', isMin && 'text-green-600')}>
                            해상운임 {r.totalCurrency} {r.totalAmount.toLocaleString()}(₩{ocean.toLocaleString()})
                            {r.breakdown.length > 0 && <> + 부대비용 ₩{surcharge.toLocaleString()}</>}
                            {' '}= <span className="text-base">총 ₩{total.toLocaleString()}</span>
                            {isMin && <span className="ml-1.5 text-[10px] font-semibold bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">최저</span>}
                          </div>
                          {r.breakdown.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.breakdown.map((b, i) => (
                                <span key={i} className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 whitespace-nowrap">
                                  {b.label} {b.currency} {b.amount.toLocaleString()}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {r.quoteDate || '-'}
                          {r.quoteMonth && <span className="ml-1 text-[10px] bg-muted rounded px-1 py-0.5">{r.quoteMonth} 견적</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.contactPerson || '-'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            {r.sourceFileUrl && <a href={r.sourceFileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs whitespace-nowrap">원본</a>}
                            <button type="button" onClick={() => setHistoryFor(r)} title="이력 보기" className="text-muted-foreground hover:text-foreground"><History className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setModalOpen({ open: true, item: r })} title="수정" className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => removeRate(r)} title="삭제" className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen.open && (
        <RateModal item={modalOpen.item} forwarders={forwarders} defaultPol={pol} defaultPod={pod}
          onClose={() => setModalOpen({ open: false })}
          onSaved={() => { setModalOpen({ open: false }); loadLanes(); loadCompare(); loadForwarderSummaries(); }} />
      )}
      {historyFor && (
        <HistoryModal base={historyFor} onClose={() => setHistoryFor(null)} />
      )}
      {bulkOpen && (
        <BulkPasteModal forwarders={forwarders} prefill={bulkPrefill} onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); loadLanes(); loadCompare(); loadForwarderSummaries(); }} />
      )}
      {fileUploadOpen && (
        <FileUploadImportModal forwarders={forwarders} onClose={() => setFileUploadOpen(false)}
          onSaved={() => { setFileUploadOpen(false); loadLanes(); loadCompare(); loadForwarderSummaries(); }} />
      )}
    </div>
  );
}

function emptyBreakdownItem(): BreakdownItem { return { label: '', amount: 0, currency: 'KRW' }; }

function RateModal({ item, forwarders, defaultPol, defaultPod, onClose, onSaved }: {
  item?: ForwarderRate | null; forwarders: Company[]; defaultPol: string; defaultPod: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    forwarderName: item?.forwarderName || '',
    pol: item?.pol || defaultPol || '',
    pod: item?.pod || defaultPod || '',
    containerType: item?.containerType || '20GP',
    carrier: item?.carrier || '',
    rateType: item?.rateType || '',
    totalAmount: item?.totalAmount ?? 0,
    totalCurrency: item?.totalCurrency || 'USD',
    quoteDate: item?.quoteDate || new Date().toISOString().slice(0, 10),
    validUntil: item?.validUntil || '',
    docNo: item?.docNo || '',
    contactPerson: item?.contactPerson || '',
    memo: item?.memo || '',
  });
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>(item?.breakdown?.length ? item.breakdown : []);
  const [showBreakdown, setShowBreakdown] = useState(!!item?.breakdown?.length);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sourceFileUrl, setSourceFileUrl] = useState(item?.sourceFileUrl || '');

  const forwarderMatch = forwarders.find(f => f.name === form.forwarderName);

  const updateBreakdown = (idx: number, field: keyof BreakdownItem, val: string | number) => {
    const next = [...breakdown];
    (next[idx] as any)[field] = val;
    setBreakdown(next);
  };

  const save = async () => {
    if (!form.forwarderName.trim() || !form.pol.trim() || !form.pod.trim() || !form.totalAmount) {
      alert('포워더명, 출발항, 도착항, 총운임은 필수입니다.'); return;
    }
    setSaving(true);
    try {
      const body = { ...form, forwarderId: forwarderMatch?.id, breakdown };
      const url = item ? `/api/forwarder-rates/${item.id}` : '/api/forwarder-rates';
      const res = await fetch(url, {
        method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '저장 실패'); return; }
      onSaved();
    } finally { setSaving(false); }
  };

  const uploadSourceFile = async (recordId: string, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/forwarder-rates/${recordId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) setSourceFileUrl(j.data.url);
      else alert(j.error || '업로드 실패');
    } finally { setUploading(false); }
  };

  const handleFileSelect = async (file: File) => {
    if (item) { await uploadSourceFile(item.id, file); return; }
    // 신규 등록 중이면 먼저 저장부터 해서 id를 확보한 뒤 업로드한다.
    if (!form.forwarderName.trim() || !form.pol.trim() || !form.pod.trim() || !form.totalAmount) {
      alert('파일을 첨부하려면 먼저 포워더명·출발항·도착항·총운임을 입력하세요.'); return;
    }
    setSaving(true);
    try {
      const body = { ...form, forwarderId: forwarderMatch?.id, breakdown };
      const res = await fetch('/api/forwarder-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '저장 실패'); return; }
      await uploadSourceFile(j.data.id, file);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2" onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{item ? '운임 수정' : '운임 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">포워더명 *</label>
              <Input list="fr-forwarder-list" value={form.forwarderName} onChange={e => setForm(f => ({ ...f, forwarderName: e.target.value }))} placeholder="예: CNC LOGIX" />
              <datalist id="fr-forwarder-list">{forwarders.map(f => <option key={f.id} value={f.name} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">출발항(POL) *</label>
              <Input value={form.pol} onChange={e => setForm(f => ({ ...f, pol: e.target.value.toUpperCase() }))} placeholder="SHANGHAI" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">도착항(POD) *</label>
              <Input value={form.pod} onChange={e => setForm(f => ({ ...f, pod: e.target.value.toUpperCase() }))} placeholder="INCHEON" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">컨테이너타입 *</label>
              <select value={form.containerType} onChange={e => setForm(f => ({ ...f, containerType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선사 (선택)</label>
              <Input value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="예: KMTC/천경" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">요율구분 (선택)</label>
              <select value={form.rateType} onChange={e => setForm(f => ({ ...f, rateType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-</option>
                <option value="ALL_IN">ALL-IN RATE</option>
                <option value="OF_SURCHARGE">O/F + SURCHARGE</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">총운임 *</label>
              <Input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.totalCurrency} onChange={e => setForm(f => ({ ...f, totalCurrency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적일자</label>
              <Input type="date" value={form.quoteDate} onChange={e => setForm(f => ({ ...f, quoteDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유효기한 (선택)</label>
              <Input value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} placeholder="예: ETD ~8/31" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">문서번호 (선택)</label>
              <Input value={form.docNo} onChange={e => setForm(f => ({ ...f, docNo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">담당자 (선택)</label>
              <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">메모</label>
              <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="참고사항" />
            </div>
          </div>

          <div className="pt-2 border-t">
            {!showBreakdown ? (
              <button type="button" onClick={() => { setShowBreakdown(true); if (breakdown.length === 0) setBreakdown([emptyBreakdownItem()]); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 세부 항목(O/F, THC 등) 추가
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">세부 항목</p>
                  <button type="button" onClick={() => setBreakdown([...breakdown, emptyBreakdownItem()])} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> 행 추가
                  </button>
                </div>
                {breakdown.map((b, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input value={b.label} onChange={e => updateBreakdown(idx, 'label', e.target.value)} placeholder="예: O/F"
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs" />
                    <input type="number" value={b.amount} onChange={e => updateBreakdown(idx, 'amount', Number(e.target.value))} placeholder="금액"
                      className="w-24 h-8 rounded-md border border-input bg-background px-2 text-xs text-right" />
                    <select value={b.currency} onChange={e => updateBreakdown(idx, 'currency', e.target.value)} className="h-8 rounded-md border border-input bg-background px-1 text-xs">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" onClick={() => setBreakdown(breakdown.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">원본 견적서 파일 (선택)</label>
            {sourceFileUrl ? (
              <a href={sourceFileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">첨부된 파일 열기</a>
            ) : (
              <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1 w-fit">
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                파일 선택
                <input type="file" className="hidden" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        <div className="p-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정 저장' : '등록')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ base, onClose }: { base: ForwarderRate; onClose: () => void }) {
  const [rows, setRows] = useState<ForwarderRate[] | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ pol: base.pol, pod: base.pod });
    if (base.forwarderId) qs.set('forwarderId', base.forwarderId);
    fetch(`/api/forwarder-rates?${qs}`).then(r => r.json()).then(j => {
      const all: ForwarderRate[] = j.data || [];
      const filtered = all.filter(r =>
        (base.forwarderId ? r.forwarderId === base.forwarderId : r.forwarderName === base.forwarderName) &&
        r.containerType === base.containerType && (r.carrier || '') === (base.carrier || ''));
      setRows(filtered);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold">운임 이력</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{base.forwarderName} · {base.pol} → {base.pod} · {base.containerType}{base.carrier ? ` · ${base.carrier}` : ''}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {rows === null ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">이력이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r, idx) => (
                <div key={r.id} className={cn('border rounded-lg px-3 py-2 text-sm', idx === 0 && 'border-primary bg-primary/5')}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.quoteDate || r.createdAt.slice(0, 10)}
                      {r.quoteMonth && <span className="ml-1.5 text-[10px] font-normal bg-muted rounded px-1 py-0.5">{r.quoteMonth} 견적</span>}
                    </span>
                    <span className="font-semibold">{r.totalCurrency} {r.totalAmount.toLocaleString()}</span>
                  </div>
                  {(r.validUntil || r.contactPerson || r.memo) && (
                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                      {r.validUntil && <span>유효기한: {r.validUntil}</span>}
                      {r.contactPerson && <span>담당자: {r.contactPerson}</span>}
                      {r.memo && <span>{r.memo}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BulkRow { pol: string; pod: string; rate20: string; rate40: string; carrier: string }
function emptyBulkRow(): BulkRow { return { pol: '', pod: '', rate20: '', rate40: '', carrier: '' }; }
const BULK_COLS: (keyof BulkRow)[] = ['pol', 'pod', 'rate20', 'rate40', 'carrier'];

export interface BulkPrefill {
  forwarderName: string; totalCurrency: string; validUntil: string; contactPerson: string;
  previousQuoteDate?: string; rows: BulkRow[];
}

/** 포워더 견적서마다 형식이 완전히 달라 자동 파싱은 하지 않고, 대신 엑셀에서 복사한 표를
 * 이 그리드에 그대로 붙여넣으면(Cmd/Ctrl+V) 셀 단위로 채워지게 해서 타이핑량을 줄인다.
 * 한 문서 = 포워더 하나·통화 하나·견적일자 하나라는 실제 견적서 구조를 그대로 반영해
 * 그 값들은 공통 필드로 한 번만 입력하고, 노선/운임만 행마다 다르게 관리한다.
 *
 * prefill이 있으면 "이번달 갱신" 진입 — 지난 견적의 노선·선사 구성을 그대로 불러와
 * 금액 칸만 비워서 보여준다(같은 표를 다시 만들 필요 없이 숫자만 바꿔 넣게). */
function BulkPasteModal({ forwarders, prefill, onClose, onSaved }: { forwarders: Company[]; prefill?: BulkPrefill | null; onClose: () => void; onSaved: () => void }) {
  const [forwarderName, setForwarderName] = useState(prefill?.forwarderName || '');
  const [totalCurrency, setTotalCurrency] = useState(prefill?.totalCurrency || 'USD');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  // "이번달 갱신"으로 들어와도 지난달 구성을 참고할 뿐, 실제로는 항상 "이번 달" 견적을
  // 등록하는 것이므로 견적월은 지난 데이터의 월이 아니라 오늘 기준 현재월을 기본값으로 한다.
  const [quoteMonth, setQuoteMonth] = useState(new Date().toISOString().slice(0, 7));
  const [validUntil, setValidUntil] = useState(prefill?.validUntil || '');
  const [contactPerson, setContactPerson] = useState(prefill?.contactPerson || '');
  const [rows, setRows] = useState<BulkRow[]>(
    prefill?.rows?.length
      ? [...prefill.rows, ...Array.from({ length: 3 }, emptyBulkRow)]
      : Array.from({ length: 8 }, emptyBulkRow),
  );
  const [saving, setSaving] = useState(false);

  const forwarderMatch = forwarders.find(f => f.name === forwarderName);

  const updateCell = (r: number, field: keyof BulkRow, val: string) => {
    setRows(prev => { const next = [...prev]; next[r] = { ...next[r], [field]: val }; return next; });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return; // 단일 값이면 기본 붙여넣기 그대로 둠
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    setRows(prev => {
      const next = [...prev];
      lines.forEach((line, li) => {
        const cells = line.split('\t');
        const targetRow = rowIdx + li;
        while (next.length <= targetRow) next.push(emptyBulkRow());
        cells.forEach((cell, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol < BULK_COLS.length) next[targetRow] = { ...next[targetRow], [BULK_COLS[targetCol]]: cell.trim() };
        });
      });
      return next;
    });
  };

  const validRowCount = rows.filter(r => r.pol.trim() && r.pod.trim() && (r.rate20.trim() || r.rate40.trim())).length;

  const save = async () => {
    if (!forwarderName.trim()) { alert('포워더명을 입력하세요.'); return; }
    const bulkRows: { pol: string; pod: string; containerType: string; totalAmount: number; carrier?: string }[] = [];
    for (const r of rows) {
      if (!r.pol.trim() || !r.pod.trim()) continue;
      const rate20 = Number(r.rate20);
      const rate40 = Number(r.rate40);
      if (r.rate20.trim() && Number.isFinite(rate20) && rate20 > 0) bulkRows.push({ pol: r.pol, pod: r.pod, containerType: '20GP', totalAmount: rate20, carrier: r.carrier || undefined });
      if (r.rate40.trim() && Number.isFinite(rate40) && rate40 > 0) bulkRows.push({ pol: r.pol, pod: r.pod, containerType: '40GP', totalAmount: rate40, carrier: r.carrier || undefined });
    }
    if (bulkRows.length === 0) { alert('등록할 행이 없습니다. 출발항/도착항과 운임을 확인하세요.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/forwarder-rates/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forwarderId: forwarderMatch?.id, forwarderName, totalCurrency, quoteDate, quoteMonth, validUntil, contactPerson, rows: bulkRows }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '저장 실패'); return; }
      alert(`${j.data.length}건 등록되었습니다(${quoteMonth} 견적으로 저장 — 같은 달에 이미 있던 노선은 갱신됨).`);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold">{prefill ? `${prefill.forwarderName} — 이번달 갱신` : '엑셀에서 붙여넣기'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {prefill
                ? `지난 견적(${prefill.previousQuoteDate || '이전'}) 구성을 그대로 불러왔습니다. 바뀐 금액만 고쳐서 저장하세요 — 노선을 다시 입력할 필요 없습니다.`
                : '아래 표의 아무 칸이나 클릭한 뒤, 엑셀에서 복사한 표를 그대로 붙여넣으세요(Cmd/Ctrl+V).'}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">포워더명 *</label>
              <Input list="fr-bulk-forwarder-list" value={forwarderName} onChange={e => setForwarderName(e.target.value)} placeholder="예: ANC International Inc." />
              <datalist id="fr-bulk-forwarder-list">{forwarders.map(f => <option key={f.id} value={f.name} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={totalCurrency} onChange={e => setTotalCurrency(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적월 *</label>
              <Input type="month" value={quoteMonth} onChange={e => setQuoteMonth(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">같은 달에 이미 등록된 노선은 이 저장으로 덮어씁니다.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적일자</label>
              <Input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유효기한 (선택)</label>
              <Input value={validUntil} onChange={e => setValidUntil(e.target.value)} placeholder="예: ETD ~8/31" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">담당자 (선택)</label>
              <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold">노선별 운임 ({validRowCount}행 등록 예정)</p>
              <button type="button" onClick={() => setRows(r => [...r, emptyBulkRow()])} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />행 추가</button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-32">출발항(POL)</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-32">도착항(POD)</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-24">20GP운임</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-24">40GP운임</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">선사(선택)</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      {BULK_COLS.map((col, ci) => (
                        <td key={col} className="px-1 py-1">
                          <input
                            value={r[col]}
                            onChange={e => updateCell(ri, col, e.target.value)}
                            onPaste={e => handlePaste(e, ri, ci)}
                            className={cn('w-full bg-transparent border-none outline-none text-sm px-1', (col === 'rate20' || col === 'rate40') && 'text-right')}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <button type="button" onClick={() => setRows(rs => rs.filter((_, i) => i !== ri))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="p-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `${validRowCount}건 일괄 등록`}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ParsedBreakdownItem { label: string; amount: number; currency: string }
interface ParsedFileRow {
  pol: string; pod: string; containerType: string; carrier?: string; rateType?: string;
  totalAmount: number; totalCurrency: string; breakdown: ParsedBreakdownItem[];
  needsReview?: boolean; reviewNote?: string;
}

/** 엑셀/PDF 견적 파일을 업로드하면 서버가 자동으로 노선·운임을 읽어서 돌려주고,
 * 여기서는 그 결과를 사람이 확인·수정한 뒤에만 저장한다(자동 파싱이 절대 바로
 * DB에 반영되지 않음 — 파싱 정확도 리스크를 이 확인 단계로 상쇄). */
function FileUploadImportModal({ forwarders, onClose, onSaved }: { forwarders: Company[]; onClose: () => void; onSaved: () => void }) {
  const [forwarderName, setForwarderName] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [quoteMonth, setQuoteMonth] = useState(new Date().toISOString().slice(0, 7));
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedFileRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const forwarderMatch = forwarders.find(f => f.name === forwarderName);

  const parse = async () => {
    if (!forwarderName.trim()) { alert('포워더명을 입력하세요.'); return; }
    if (!file) { alert('파일을 선택하세요.'); return; }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('forwarderName', forwarderName.trim());
      const res = await fetch('/api/forwarder-rates/parse-upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '파싱 실패'); return; }
      setRows(j.data);
      setWarnings(j.warnings || []);
      if (!j.data.length) alert('파일에서 운임 데이터를 찾지 못했습니다.');
    } finally { setParsing(false); }
  };

  const updateAmount = (idx: number, val: string) => {
    const n = Number(val);
    setRows(prev => prev ? prev.map((r, i) => (i === idx ? { ...r, totalAmount: Number.isFinite(n) ? n : r.totalAmount } : r)) : prev);
  };
  const removeRow = (idx: number) => setRows(prev => (prev ? prev.filter((_, i) => i !== idx) : prev));

  const save = async () => {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    try {
      const totalCurrency = rows[0]?.totalCurrency || 'USD';
      const res = await fetch('/api/forwarder-rates/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forwarderId: forwarderMatch?.id, forwarderName: forwarderName.trim(), totalCurrency, quoteDate, quoteMonth,
          rows: rows.map(r => ({ pol: r.pol, pod: r.pod, containerType: r.containerType, carrier: r.carrier, rateType: r.rateType, totalAmount: r.totalAmount, breakdown: r.breakdown })),
        }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '저장 실패'); return; }
      alert(`${j.data.length}건 등록되었습니다(같은 달에 이미 있던 노선은 갱신됨).`);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold">파일에서 자동 등록</h2>
            <p className="text-xs text-muted-foreground mt-0.5">견적 엑셀(.xlsx) 또는 PDF를 업로드하면 노선·운임을 자동으로 읽어옵니다. 저장 전에 아래에서 확인·수정하세요.</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">포워더명 *</label>
              <Input list="fr-upload-forwarder-list" value={forwarderName} onChange={e => setForwarderName(e.target.value)} placeholder="예: CNC LOGIX CO., LTD." />
              <datalist id="fr-upload-forwarder-list">{forwarders.map(f => <option key={f.id} value={f.name} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적월 *</label>
              <Input type="month" value={quoteMonth} onChange={e => setQuoteMonth(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적일자</label>
              <Input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">파일(.xlsx/.pdf)</label>
              <input type="file" accept=".xlsx,.xls,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
            </div>
          </div>
          <Button type="button" onClick={parse} disabled={parsing} className="gap-1.5">
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            파일 읽기
          </Button>

          {warnings.length > 0 && (
            <div className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 space-y-0.5">
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {rows && (
            <div>
              <p className="text-xs font-semibold mb-1">읽어온 노선 ({rows.length}건) — 저장 전 확인하세요(노란색은 국내 부대비용 이력이 없어 직접 확인 필요)</p>
              <div className="overflow-x-auto border rounded-lg max-h-[45vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">POL</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">POD</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">타입</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">선사</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">총운임</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">부대비용</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => (
                      <tr key={i} className={cn(r.needsReview && 'bg-amber-50')}>
                        <td className="px-2 py-1 whitespace-nowrap">{r.pol}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.pod}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.containerType}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.carrier || '-'}</td>
                        <td className="px-1 py-1 text-right whitespace-nowrap">
                          <input value={r.totalAmount} onChange={e => updateAmount(i, e.target.value)}
                            className="w-20 bg-transparent border-none outline-none text-sm text-right px-1" />
                          <span className="text-xs text-muted-foreground ml-1">{r.totalCurrency}</span>
                        </td>
                        <td className="px-2 py-1 min-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {r.breakdown.map((b, bi) => (
                              <span key={bi} className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 whitespace-nowrap">{b.label} {b.currency} {b.amount.toLocaleString()}</span>
                            ))}
                          </div>
                          {r.reviewNote && <div className="text-[10px] text-amber-600 mt-0.5">{r.reviewNote}</div>}
                        </td>
                        <td className="px-1 py-1"><button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={save} disabled={saving || !rows || rows.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `${rows?.length || 0}건 저장`}
          </Button>
        </div>
      </div>
    </div>
  );
}
