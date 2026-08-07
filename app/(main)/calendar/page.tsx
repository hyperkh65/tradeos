'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_CALENDAR_EVENTS } from '@/lib/demo-data';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const typeColor: Record<string, string> = {
  deadline: 'bg-red-500',
  meeting: 'bg-blue-500',
  inspection: 'bg-purple-500',
  shipment: 'bg-cyan-500',
  payment: 'bg-orange-500',
  event: 'bg-gray-500',
};

const typeLabel: Record<string, string> = {
  deadline: '마감', meeting: '미팅', inspection: '검품', shipment: '선적', payment: '결제', event: '일정',
};

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (d: number | null) => d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  const eventsOn = (d: number | null) => d ? DEMO_CALENDAR_EVENTS.filter(e => e.date === pad(d)) : [];

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const monthName = new Date(year, month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="일정" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{monthName}</h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft className="w-4 h-4"/></Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth());}}>오늘</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}><ChevronRight className="w-4 h-4"/></Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4">
          {Object.entries(typeLabel).map(([k,v])=>(
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full',typeColor[k])}/>
              {v}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 min-h-0 flex flex-col border border-border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {['일','월','화','수','목','금','토'].map((d,i)=>(
              <div key={d} className={cn('py-2 text-center text-xs font-semibold',i===0?'text-red-500':i===6?'text-blue-500':'text-muted-foreground')}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
            {cells.map((day, i) => {
              const events = eventsOn(day);
              const dateStr = pad(day);
              const isToday = dateStr === todayStr;
              const col = i % 7;
              return (
                <div key={i} className={cn(
                  'border-b border-r border-border p-1 min-h-[70px] md:min-h-[90px] overflow-hidden',
                  'last:border-r-0 [&:nth-child(7n)]:border-r-0',
                  !day && 'bg-muted/20',
                  col === 0 && day && 'bg-red-50/30',
                  col === 6 && day && 'bg-blue-50/30',
                )}>
                  {day && (
                    <>
                      <div className={cn(
                        'w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full mb-1',
                        isToday ? 'bg-primary text-primary-foreground' : col===0?'text-red-500':col===6?'text-blue-500':'text-foreground'
                      )}>{day}</div>
                      <div className="space-y-0.5">
                        {events.slice(0, 2).map(ev=>(
                          <div key={ev.id} className={cn('text-[10px] text-white px-1 py-0.5 rounded truncate leading-tight', typeColor[ev.type])}>
                            {ev.title}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{events.length-2}건</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* This month events list */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">이번 달 일정</h3>
          <div className="space-y-1.5">
            {DEMO_CALENDAR_EVENTS
              .filter(e => e.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))
              .sort((a,b)=>a.date.localeCompare(b.date))
              .map(ev=>(
                <div key={ev.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0',typeColor[ev.type])}/>
                  <span className="text-xs text-muted-foreground w-14 shrink-0">{ev.date.slice(5).replace('-','/')}</span>
                  <span className="text-sm font-medium">{ev.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{typeLabel[ev.type]}</span>
                </div>
              ))
            }
            {DEMO_CALENDAR_EVENTS.filter(e=>e.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).length===0&&(
              <p className="text-sm text-muted-foreground py-4 text-center">이번 달 일정이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
