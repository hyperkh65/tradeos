'use client';

import { AppHeader } from '@/components/layout/header';
import { ChevronLeft, ChevronRight, Plus, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  all_day: number;
  description?: string;
  created_by: string;
  created_by_name?: string;
  category?: string;
  created_at: string;
}

interface ErpEvent {
  id: string;
  date: string;
  title: string;
  erpType: string;
  link: string;
}

const typeLabel: Record<string, string> = {
  personal: '개인',
  deadline: '마감',
  meeting: '미팅',
  inspection: '검품',
  shipment: '선적',
  payment: '결제',
  event: '일정',
};

const ERP_COLORS: Record<string, string> = {
  company: 'bg-indigo-500',
  quote: 'bg-blue-500',
  po: 'bg-orange-500',
  po_etd: 'bg-sky-500',
  po_production: 'bg-yellow-600',
  shipment: 'bg-cyan-600',
  shipment_eta: 'bg-teal-500',
  sale: 'bg-emerald-500',
  cost: 'bg-red-500',
  inspection: 'bg-violet-500',
  claim: 'bg-pink-500',
  expense: 'bg-amber-600',
};

const ERP_LABELS: Record<string, string> = {
  company: '거래처',
  quote: '견적',
  po: '발주',
  po_etd: 'ETD',
  po_production: '생산완료',
  shipment: '선적ETD',
  shipment_eta: '도착ETA',
  sale: '매출',
  cost: '비용',
  inspection: '검품',
  claim: '클레임',
  expense: '지급',
};

function getManualColor(ev: CalendarEvent, myId?: string): string {
  if (ev.category) return 'bg-purple-500';
  if (ev.created_by === myId) return 'bg-blue-500';
  return 'bg-green-500';
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export default function CalendarPage() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [erpEvents, setErpEvents] = useState<ErpEvent[]>([]);
  const [myId, setMyId] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'personal', date: '', description: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch('/api/calendar').then(r => r.json());
    setEvents(Array.isArray(data) ? data : []);
  }, []);

  const loadErp = useCallback(async (y: number, m: number) => {
    try {
      const res = await fetch(`/api/calendar/erp-events?year=${y}&month=${m}`).then(r => r.json());
      setErpEvents(Array.isArray(res.data) ? res.data : []);
    } catch {
      setErpEvents([]);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => {
      if (j?.user?.id) setMyId(j.user.id);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadErp(year, month); }, [loadErp, year, month]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (d: number | null) =>
    d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';

  // 특정 날의 이벤트 (타입별 그룹핑용 도트)
  const erpDotsOn = (dateStr: string) => {
    const types = new Set(erpEvents.filter(e => e.date === dateStr).map(e => e.erpType));
    return Array.from(types).slice(0, 6);
  };

  const manualOn = (dateStr: string) => events.filter(e => e.date === dateStr);
  const erpOn = (dateStr: string) => erpEvents.filter(e => e.date === dateStr);
  const totalOn = (dateStr: string) => manualOn(dateStr).length + erpOn(dateStr).length;

  const prev = () => {
    const newMonth = month === 0 ? 11 : month - 1;
    const newYear = month === 0 ? year - 1 : year;
    setYear(newYear);
    setMonth(newMonth);
  };
  const next = () => {
    const newMonth = month === 11 ? 0 : month + 1;
    const newYear = month === 11 ? year + 1 : year;
    setYear(newYear);
    setMonth(newMonth);
  };

  const monthName = new Date(year, month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  const openCreate = (dateStr?: string) => {
    setForm({ title: '', type: 'personal', date: dateStr ?? todayStr, description: '' });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date) return;
    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('일정을 삭제하시겠습니까?')) return;
    await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    load();
  };

  // 선택된 날의 이벤트
  const selManual = manualOn(selectedDate);
  const selErp = erpOn(selectedDate);
  const selTotal = selManual.length + selErp.length;

  // 검색 필터 (전체 이벤트 대상)
  const q = searchQuery.toLowerCase().trim();
  const searchResults = q
    ? [
        ...events
          .filter(e => e.title.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q))
          .map(e => ({ id: e.id, date: e.date, title: e.title, colorClass: getManualColor(e, myId), isErp: false, link: undefined as string | undefined })),
        ...erpEvents
          .filter(e => e.title.toLowerCase().includes(q))
          .map(e => ({ id: e.id, date: e.date, title: e.title, colorClass: ERP_COLORS[e.erpType] || 'bg-gray-400', isErp: true, link: e.link })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="일정" />

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">일정 추가</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">제목</label>
                <Input className="mt-1 h-9" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="일정 제목" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">유형</label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">날짜</label>
                <Input type="date" className="mt-1 h-9" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">메모</label>
                <textarea
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="메모 (선택사항)"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>취소</Button>
              <Button className="flex-1" onClick={handleCreate}>저장</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
        {/* 왼쪽: 캘린더 */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-5">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">{monthName}</h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(todayStr); }}>오늘</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowSearch(s => !s)}><Search className="w-4 h-4" /></Button>
              <Button size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => openCreate(selectedDate)}><Plus className="w-3.5 h-3.5" />추가</Button>
            </div>
          </div>

          {/* 검색바 */}
          {showSearch && (
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full h-8 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="일정/전산 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchQuery('')}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* 범례 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            {[
              { color: 'bg-blue-500', label: '내 일정' },
              { color: 'bg-green-500', label: '팀원' },
              { color: 'bg-blue-500', label: '견적' },
              { color: 'bg-orange-500', label: '발주' },
              { color: 'bg-sky-500', label: 'ETD' },
              { color: 'bg-cyan-600', label: '선적' },
              { color: 'bg-teal-500', label: '도착' },
              { color: 'bg-emerald-500', label: '매출' },
              { color: 'bg-red-500', label: '비용' },
              { color: 'bg-violet-500', label: '검품' },
              { color: 'bg-pink-500', label: '클레임' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className={cn('w-2 h-2 rounded-full', color)} />{label}
              </div>
            ))}
          </div>

          {/* 달력 그리드 */}
          <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden min-h-0">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/30 shrink-0">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className={cn('py-2 text-center text-xs font-semibold', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground')}>{d}</div>
              ))}
            </div>

            {/* 날짜 셀 */}
            <div className="flex-1 grid grid-cols-7 min-h-0" style={{ gridTemplateRows: `repeat(${Math.ceil(cells.length / 7)}, 1fr)` }}>
              {cells.map((day, i) => {
                const dateStr = pad(day);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const col = i % 7;
                const erpDots = day ? erpDotsOn(dateStr) : [];
                const manualCount = day ? manualOn(dateStr).length : 0;
                const total = day ? totalOn(dateStr) : 0;

                return (
                  <div
                    key={i}
                    className={cn(
                      'border-b border-r border-border p-1.5 overflow-hidden transition-colors',
                      'last:border-r-0 [&:nth-child(7n)]:border-r-0',
                      !day && 'bg-muted/10',
                      day && 'cursor-pointer hover:bg-muted/30',
                      isSelected && day && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
                      col === 0 && day && !isSelected && 'bg-red-50/20',
                      col === 6 && day && !isSelected && 'bg-blue-50/20',
                    )}
                    onClick={() => day && setSelectedDate(dateStr)}
                  >
                    {day && (
                      <div className="flex flex-col h-full">
                        {/* 날짜 숫자 */}
                        <div className={cn(
                          'w-6 h-6 flex items-center justify-center text-xs font-semibold rounded-full mb-1 shrink-0',
                          isToday ? 'bg-primary text-primary-foreground' : col === 0 ? 'text-red-500' : col === 6 ? 'text-blue-500' : 'text-foreground'
                        )}>{day}</div>

                        {/* 건수 뱃지 */}
                        {total > 0 && (
                          <div className="mb-1">
                            <span className={cn(
                              'text-[9px] font-semibold px-1 py-0.5 rounded',
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            )}>
                              {total}건
                            </span>
                          </div>
                        )}

                        {/* 수동 일정 바 */}
                        {manualCount > 0 && (
                          <div className="mb-0.5">
                            <div className={cn('h-1.5 rounded-full', 'bg-blue-500')} style={{ width: '100%', opacity: 0.8 }} />
                          </div>
                        )}

                        {/* ERP 타입별 컬러 도트 */}
                        <div className="flex flex-wrap gap-0.5">
                          {erpDots.map(type => (
                            <span key={type} className={cn('w-1.5 h-1.5 rounded-full', ERP_COLORS[type] || 'bg-gray-400')} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 선택 날짜 상세 패널 */}
        <div className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden">
          {/* 패널 헤더 */}
          <div className="bg-primary px-4 py-3 shrink-0">
            <h3 className="text-sm font-semibold text-primary-foreground">
              {q ? `검색: "${searchQuery}"` : fmtDate(selectedDate)}
            </h3>
            <p className="text-[11px] text-primary-foreground/70 mt-0.5">
              {q ? `${searchResults.length}건 검색됨` : `총 ${selTotal}건${selTotal > 0 ? ` · 수동 ${selManual.length} / 전산 ${selErp.length}` : ''}`}
            </p>
          </div>

          {/* 일정 추가 버튼 */}
          {!q && (
            <div className="px-4 py-2 border-b border-border shrink-0">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => openCreate(selectedDate)}>
                <Plus className="w-3 h-3" />이 날 일정 추가
              </Button>
            </div>
          )}

          {/* 검색 결과 */}
          {q ? (
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">검색 결과 없음</div>
              ) : searchResults.map(ev => (
                ev.link ? (
                  <a key={ev.id} href={ev.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', ev.colorClass)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{ev.title}</p>
                      <p className="text-[10px] text-muted-foreground">{ev.date.slice(5).replace('-', '/')}</p>
                    </div>
                  </a>
                ) : (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', ev.colorClass)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{ev.title}</p>
                      <p className="text-[10px] text-muted-foreground">{ev.date.slice(5).replace('-', '/')}</p>
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : (
          /* 이벤트 목록 */
          <div className="flex-1 overflow-y-auto">
            {selTotal === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground">
                일정이 없습니다
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* 수동 일정 */}
                {selManual.map(ev => (
                  <div key={ev.id} className="px-4 py-3 group">
                    <div className="flex items-start gap-2">
                      <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', getManualColor(ev, myId))} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{ev.title}</p>
                        {ev.created_by_name && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.created_by_name}</p>}
                        {ev.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.description}</p>}
                        <span className="text-[10px] text-muted-foreground">{typeLabel[ev.type] ?? ev.type}</span>
                      </div>
                      <button onClick={() => handleDelete(ev.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* 전산 ERP 이벤트 */}
                {selErp.length > 0 && selManual.length > 0 && (
                  <div className="px-4 py-1.5 bg-muted/30">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">전산 현황 ({selErp.length}건)</p>
                  </div>
                )}
                {selErp.map(ev => (
                  <a key={ev.id} href={ev.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', ERP_COLORS[ev.erpType] || 'bg-gray-400')} />
                    <p className="text-xs flex-1 truncate">{ev.title}</p>
                    <span className={cn('text-[9px] text-white px-1.5 py-0.5 rounded shrink-0 font-medium', ERP_COLORS[ev.erpType] || 'bg-gray-400')}>
                      {ERP_LABELS[ev.erpType] || ev.erpType}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
