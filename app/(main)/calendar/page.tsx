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
  created_at: string;
}

const typeColor: Record<string, string> = {
  personal: 'bg-gray-500',
  deadline: 'bg-red-500',
  meeting: 'bg-blue-500',
  inspection: 'bg-purple-500',
  shipment: 'bg-cyan-500',
  payment: 'bg-orange-500',
  event: 'bg-green-500',
};

const typeLabel: Record<string, string> = {
  personal: '개인',
  deadline: '마감',
  meeting: '미팅',
  inspection: '검품',
  shipment: '선적',
  payment: '결제',
  event: '일정',
};

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [form, setForm] = useState({ title: '', type: 'personal', date: '', description: '' });

  const load = useCallback(async () => {
    const data = await fetch('/api/calendar').then(r => r.json());
    setEvents(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (d: number | null) => d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  const eventsOn = (d: number | null) => d ? events.filter(e => e.date === pad(d)) : [];

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const monthName = new Date(year, month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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

  const monthEvents = events
    .filter(e => e.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .sort((a, b) => a.date.localeCompare(b.date));

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

      <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{monthName}</h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>오늘</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
            <Button size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => openCreate()}><Plus className="w-3.5 h-3.5" />추가</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {Object.entries(typeLabel).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full', typeColor[k] ?? 'bg-gray-400')} />
              {v}
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex flex-col border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={cn('py-2 text-center text-xs font-semibold', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground')}>{d}</div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
            {cells.map((day, i) => {
              const dayEvents = eventsOn(day);
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
                        {dayEvents.slice(0, 2).map(ev => (
                          <div
                            key={ev.id}
                            className={cn('text-[10px] text-white px-1 py-0.5 rounded truncate leading-tight', typeColor[ev.type] ?? 'bg-gray-500')}
                            onClick={e => { e.stopPropagation(); }}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 2}건</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">이번 달 일정</h3>
          <div className="space-y-1.5">
            {monthEvents.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">이번 달 일정이 없습니다.</p>
            )}
            {monthEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group">
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', typeColor[ev.type] ?? 'bg-gray-400')} />
                <span className="text-xs text-muted-foreground w-14 shrink-0">{ev.date.slice(5).replace('-', '/')}</span>
                <span className="text-sm font-medium flex-1">{ev.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{typeLabel[ev.type] ?? ev.type}</span>
                <button
                  onClick={() => handleDelete(ev.id)}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
