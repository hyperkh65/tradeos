'use client';

import { AppHeader } from '@/components/layout/header';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  end_date?: string;
  all_day: number;
  description?: string;
  created_by: string;
  created_by_name?: string;
  category?: string;
  related_id?: string;
  created_at: string;
}

interface ErpEvent {
  id: string;
  date: string;
  title: string;
  erpType: string;
  link: string;
}

interface DayEvent {
  id: string;
  date: string;
  title: string;
  colorClass: string;
  isErp: boolean;
  erpType?: string;
  link?: string;
  calEvent?: CalendarEvent;
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

function getEventColor(ev: CalendarEvent, myId?: string): string {
  if (ev.category) return 'bg-purple-500';
  if (ev.created_by === myId) return 'bg-blue-500';
  return 'bg-green-500';
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [erpEvents, setErpEvents] = useState<ErpEvent[]>([]);
  const [myId, setMyId] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'personal', date: '', description: '' });

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

  const pad = (d: number | null) => d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';

  const allEventsOn = (d: number | null): DayEvent[] => {
    if (!d) return [];
    const dateStr = pad(d);
    const manual: DayEvent[] = events
      .filter(e => e.date === dateStr)
      .map(e => ({ id: e.id, date: e.date, title: e.title, colorClass: getEventColor(e, myId), isErp: false, calEvent: e }));
    const erp: DayEvent[] = erpEvents
      .filter(e => e.date === dateStr)
      .map(e => ({ id: e.id, date: e.date, title: e.title, colorClass: ERP_COLORS[e.erpType] || 'bg-gray-400', isErp: true, erpType: e.erpType, link: e.link }));
    return [...manual, ...erp];
  };

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const monthName = new Date(year, month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

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

  const monthManual = events.filter(e => e.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date));
  const monthErp = erpEvents.filter(e => e.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date));

  const todayManual = events.filter(e => e.date === todayStr);
  const todayErp = erpEvents.filter(e => e.date === todayStr);

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

      <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col lg:flex-row gap-4">
        {/* 메인 캘린더 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">{monthName}</h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>오늘</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
              <Button size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => openCreate()}><Plus className="w-3.5 h-3.5" />추가</Button>
            </div>
          </div>

          {/* 범례 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-blue-500" />내 일정
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500" />팀원
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-orange-500" />발주
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-sky-500" />ETD
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-cyan-600" />선적
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-teal-500" />도착
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />매출
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-red-500" />비용
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-violet-500" />검품
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-pink-500" />클레임
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-muted/30">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className={cn('py-2 text-center text-xs font-semibold', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground')}>{d}</div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
              {cells.map((day, i) => {
                const dayEvents = allEventsOn(day);
                const dateStr = pad(day);
                const isToday = dateStr === todayStr;
                const col = i % 7;
                return (
                  <div
                    key={i}
                    className={cn(
                      'border-b border-r border-border p-1 min-h-[70px] md:min-h-[90px] overflow-hidden cursor-pointer hover:bg-muted/20 transition-colors',
                      'last:border-r-0 [&:nth-child(7n)]:border-r-0',
                      !day && 'bg-muted/20 cursor-default',
                      col === 0 && day && 'bg-red-50/30',
                      col === 6 && day && 'bg-blue-50/30',
                    )}
                    onClick={() => day && openCreate(dateStr)}
                  >
                    {day && (
                      <>
                        <div className={cn(
                          'w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full mb-1',
                          isToday ? 'bg-primary text-primary-foreground' : col === 0 ? 'text-red-500' : col === 6 ? 'text-blue-500' : 'text-foreground'
                        )}>{day}</div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(ev => (
                            <div
                              key={ev.id}
                              className={cn('text-[10px] text-white px-1 py-0.5 rounded truncate leading-tight cursor-pointer', ev.colorClass)}
                              onClick={e => {
                                e.stopPropagation();
                                if (ev.link) window.location.href = ev.link;
                              }}
                              title={ev.title}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3}건</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 이번 달 일정 */}
          <div className="mt-4 space-y-4">
            {monthManual.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">이번 달 일정</h3>
                <div className="space-y-1.5">
                  {monthManual.map(ev => (
                    <div key={ev.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group">
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', getEventColor(ev, myId))} />
                      <span className="text-xs text-muted-foreground w-14 shrink-0">{ev.date.slice(5).replace('-', '/')}</span>
                      <span className="text-sm font-medium flex-1">{ev.title}</span>
                      {ev.created_by_name && <span className="text-xs text-muted-foreground shrink-0">{ev.created_by_name}</span>}
                      <span className="text-xs text-muted-foreground shrink-0">{typeLabel[ev.type] ?? ev.type}</span>
                      <button onClick={() => handleDelete(ev.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {monthErp.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">이번 달 전산 현황 <span className="text-xs font-normal text-muted-foreground">({monthErp.length}건)</span></h3>
                <div className="space-y-1">
                  {monthErp.map(ev => (
                    <a
                      key={ev.id}
                      href={ev.link}
                      className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <span className={cn('w-2 h-2 rounded-full shrink-0', ERP_COLORS[ev.erpType] || 'bg-gray-400')} />
                      <span className="text-xs text-muted-foreground w-14 shrink-0">{ev.date.slice(5).replace('-', '/')}</span>
                      <span className="text-xs flex-1 truncate">{ev.title}</span>
                      <span className={cn('text-[10px] text-white px-1.5 py-0.5 rounded shrink-0', ERP_COLORS[ev.erpType] || 'bg-gray-400')}>
                        {ERP_LABELS[ev.erpType] || ev.erpType}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {monthManual.length === 0 && monthErp.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">이번 달 일정이 없습니다.</p>
            )}
          </div>
        </div>

        {/* 오늘의 일정 패널 */}
        <div className="lg:w-72 shrink-0">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-primary px-3 py-2.5">
              <h3 className="text-sm font-semibold text-primary-foreground">오늘의 일정</h3>
              <p className="text-[11px] text-primary-foreground/70 mt-0.5">
                {today.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </p>
            </div>
            <div className="divide-y divide-border">
              {todayManual.length === 0 && todayErp.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">오늘 일정이 없습니다</div>
              ) : (
                <>
                  {todayManual.map(ev => (
                    <div key={ev.id} className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', getEventColor(ev, myId))} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug truncate">{ev.title}</p>
                          {ev.created_by_name && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.created_by_name}</p>}
                          {ev.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>}
                          <p className="text-[10px] text-muted-foreground mt-0.5">{typeLabel[ev.type] ?? ev.type}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {todayErp.length > 0 && (
                    <>
                      {todayManual.length > 0 && (
                        <div className="px-3 py-1 bg-muted/40">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">전산 현황</p>
                        </div>
                      )}
                      {todayErp.map(ev => (
                        <a key={ev.id} href={ev.link} className="block px-3 py-2 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full shrink-0', ERP_COLORS[ev.erpType] || 'bg-gray-400')} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium leading-snug truncate">{ev.title}</p>
                            </div>
                            <span className={cn('text-[9px] text-white px-1 py-0.5 rounded shrink-0', ERP_COLORS[ev.erpType] || 'bg-gray-400')}>
                              {ERP_LABELS[ev.erpType] || ev.erpType}
                            </span>
                          </div>
                        </a>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
