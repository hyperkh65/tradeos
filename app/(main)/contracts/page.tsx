'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Download, CheckCircle2, Clock, FileText, ChevronDown, ChevronUp, Search, Loader2, X } from 'lucide-react';

interface POItem {
  id: string;
  productName: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface PurchaseOrder {
  id: string;
  businessId: string;
  supplierName: string;
  currency: string;
  totalAmount: number;
  orderDate: string;
  status: string;
  piNumber?: string;
  piFileUrl?: string;
  piStampedUrl?: string;
  items: POItem[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  confirmed: '확정',
  production: '생산중',
  inspection: '검품',
  shipped: '선적',
  completed: '완료',
  cancelled: '취소',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  production: 'bg-yellow-100 text-yellow-700',
  inspection: 'bg-purple-100 text-purple-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

function fmtAmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ContractsPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [piInputs, setPiInputs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch('/api/purchase-orders')
      .then(r => r.json())
      .then(d => {
        setPos(d.data || []);
        const init: Record<string, string> = {};
        (d.data || []).forEach((p: PurchaseOrder) => { init[p.id] = p.piNumber || ''; });
        setPiInputs(init);
      })
      .finally(() => setLoading(false));
  }, []);

  const showMsg = (id: string, text: string, ok: boolean) => {
    setMsg({ id, text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  const savePiNumber = async (po: PurchaseOrder) => {
    const piNumber = piInputs[po.id] || '';
    setSaving(s => ({ ...s, [po.id]: true }));
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piNumber }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const d = await res.json();
      setPos(ps => ps.map(p => p.id === po.id ? { ...p, piNumber, status: d.data?.status || p.status } : p));
      showMsg(po.id, piNumber && po.status === 'draft' ? 'PI 번호 저장, 상태가 확정으로 변경됨' : 'PI 번호 저장됨', true);
    } catch {
      showMsg(po.id, '저장 실패', false);
    } finally {
      setSaving(s => ({ ...s, [po.id]: false }));
    }
  };

  const uploadPiFile = async (po: PurchaseOrder, file: File) => {
    const piNumber = piInputs[po.id] || po.piNumber || '';
    if (!piNumber.trim()) {
      alert('공급사 PI 번호를 먼저 입력하고 저장한 뒤 업로드해주세요.');
      return;
    }
    setUploading(u => ({ ...u, [po.id]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('piNumber', piNumber);
      const res = await fetch(`/api/purchase-orders/${po.id}/pi-upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setPos(ps => ps.map(p => p.id === po.id ? {
        ...p,
        piNumber: d.piNumber || piNumber,
        piFileUrl: d.piFileUrl,
        piStampedUrl: d.piStampedUrl,
        status: d.status || p.status,
      } : p));
      setPiInputs(i => ({ ...i, [po.id]: d.piNumber || piNumber }));
      showMsg(po.id, '도장 찍힌 PI 파일이 저장되었습니다', true);
    } catch (e) {
      showMsg(po.id, `업로드 실패: ${e}`, false);
    } finally {
      setUploading(u => ({ ...u, [po.id]: false }));
    }
  };

  const filtered = pos.filter(p =>
    p.businessId.toLowerCase().includes(search.toLowerCase()) ||
    p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    (p.piNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">계약 관리</h1>
          <p className="text-sm text-gray-500 mt-1">발주별 공급사 PI(Proforma Invoice) 관리 및 도장 처리</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="발주번호, 공급사, PI번호 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: '전체 발주', value: pos.length, color: 'text-gray-700' },
          { label: 'PI 등록됨', value: pos.filter(p => p.piNumber).length, color: 'text-blue-600' },
          { label: '확정 이상', value: pos.filter(p => p.status !== 'draft' && p.status !== 'cancelled').length, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* PO List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">발주 데이터가 없습니다</div>
        )}
        {filtered.map(po => {
          const isOpen = expanded === po.id;
          const piNum = piInputs[po.id] ?? po.piNumber ?? '';
          const hasPi = !!(po.piNumber);
          const hasStamped = !!(po.piStampedUrl);

          return (
            <div key={po.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : po.id)}
              >
                <div className="flex-1 grid grid-cols-4 gap-2 items-center">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{po.businessId}</div>
                    <div className="text-xs text-gray-500">{po.orderDate}</div>
                  </div>
                  <div className="text-sm text-gray-700">{po.supplierName}</div>
                  <div className="text-sm font-medium text-gray-800">{fmtAmt(po.totalAmount, po.currency)}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[po.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[po.status] || po.status}
                    </span>
                    {hasPi && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        PI {po.piNumber}
                      </span>
                    )}
                    {hasStamped && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>

              {/* Expanded PI section */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
                  {/* Message */}
                  {msg?.id === po.id && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      {msg.text}
                    </div>
                  )}

                  {/* Product items */}
                  {po.items?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">발주 품목</div>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-3 py-2 text-gray-600">제품명</th>
                              <th className="text-right px-3 py-2 text-gray-600">수량</th>
                              <th className="text-right px-3 py-2 text-gray-600">단가</th>
                              <th className="text-right px-3 py-2 text-gray-600">금액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((item, i) => (
                              <tr key={item.id || i} className="border-b border-gray-100 last:border-0">
                                <td className="px-3 py-2 text-gray-800">{item.productName}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{item.qty?.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{item.unitPrice?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">{item.amount?.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* PI Number input */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">
                      공급사 PI 번호
                      {po.status === 'draft' && piNum && (
                        <span className="ml-2 text-blue-600">(저장 시 상태가 초안 → 확정으로 자동 변경됩니다)</span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예) PI-2026-001"
                        value={piNum}
                        onChange={e => setPiInputs(i => ({ ...i, [po.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && savePiNumber(po)}
                      />
                      <button
                        onClick={() => savePiNumber(po)}
                        disabled={saving[po.id]}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {saving[po.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        저장
                      </button>
                    </div>
                  </div>

                  {/* PI File upload */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">
                      공급사 PI 파일 (Excel/PDF)
                      <span className="ml-1 text-gray-400 font-normal">— 도장(회사명, PO번호, PI번호) 자동 삽입</span>
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                      <label
                        title={!piNum.trim() ? '공급사 PI 번호를 먼저 입력하고 저장해주세요' : undefined}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors
                          ${uploading[po.id] || !piNum.trim() ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`}
                      >
                        <input
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls,.pdf"
                          ref={el => { fileRefs.current[po.id] = el; }}
                          disabled={uploading[po.id] || !piNum.trim()}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) uploadPiFile(po, f);
                            e.target.value = '';
                          }}
                        />
                        {uploading[po.id]
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                          : <><Upload className="w-4 h-4" /> PI 파일 업로드</>
                        }
                      </label>
                      {!piNum.trim() && <span className="text-xs text-amber-600">먼저 공급사 PI 번호를 입력하고 저장하세요.</span>}

                      {po.piFileUrl && (
                        <a
                          href={po.piFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
                        >
                          <FileText className="w-4 h-4" /> 원본 PI
                        </a>
                      )}

                      {po.piStampedUrl && (
                        <a
                          href={po.piStampedUrl}
                          download
                          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium"
                        >
                          <Download className="w-4 h-4" /> 도장 PI 다운로드
                        </a>
                      )}
                    </div>

                    {po.piStampedUrl && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        도장 처리 완료 — PO: {po.businessId} / PI: {po.piNumber}
                      </div>
                    )}
                  </div>

                  {/* Status info */}
                  <div className="flex items-center gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      발주일: {po.orderDate}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[po.status] || 'bg-gray-100 text-gray-600'}`}>
                        현재 상태: {STATUS_LABEL[po.status] || po.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      우리 PO: <strong className="text-gray-700">{po.businessId}</strong>
                      {po.piNumber && <> | 공급사 PI: <strong className="text-gray-700">{po.piNumber}</strong></>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
