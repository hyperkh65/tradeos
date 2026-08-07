'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_TASKS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { CheckSquare, Plus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const priorityStyle: Record<string,string> = { urgent:'bg-red-100 text-red-700', high:'bg-orange-100 text-orange-700', medium:'bg-yellow-100 text-yellow-700', low:'bg-gray-100 text-gray-600' };
const priorityLabel: Record<string,string> = { urgent:'긴급', high:'높음', medium:'보통', low:'낮음' };
const statusStyle: Record<string,string> = { '해야 함':'bg-gray-100 text-gray-700', '진행 중':'bg-blue-100 text-blue-700', '대기':'bg-yellow-100 text-yellow-700', '완료':'bg-green-100 text-green-700' };
const statuses = ['해야 함','진행 중','대기','완료'] as const;

export default function TasksPage() {
  const [view, setView] = useState<'kanban'|'list'>('kanban');
  const byStatus = (s: string) => DEMO_TASKS.filter(t => t.status === s);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="내 업무" />
      <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            <button onClick={()=>setView('kanban')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors',view==='kanban'?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted')}>칸반</button>
            <button onClick={()=>setView('list')} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors',view==='list'?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted')}>목록</button>
          </div>
          <Button size="sm" className="h-8 gap-1"><Plus className="w-4 h-4"/><span className="hidden sm:inline">새 업무</span></Button>
        </div>

        {view==='kanban' ? (
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 h-full min-w-max pb-2">
              {statuses.map(status=>(
                <div key={status} className="w-64 flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">{status}</span>
                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full',statusStyle[status])}>{byStatus(status).length}</span>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                    {byStatus(status).map(task=>(
                      <div key={task.id} className="bg-card border border-border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded',priorityStyle[task.priority])}>{priorityLabel[task.priority]}</span>
                          {task.dueDate&&<span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/>{task.dueDate.slice(5)}</span>}
                        </div>
                        <p className="text-sm font-medium leading-tight">{task.title}</p>
                        {task.relatedName&&<p className="text-xs text-muted-foreground mt-1 truncate">{task.relatedName}</p>}
                      </div>
                    ))}
                    {byStatus(status).length===0&&(
                      <div className="flex-1 flex items-start justify-center pt-8">
                        <p className="text-xs text-muted-foreground">없음</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {DEMO_TASKS.map(task=>(
              <div key={task.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <CheckSquare className={cn('w-4 h-4 mt-0.5 shrink-0',task.status==='완료'?'text-green-600':'text-muted-foreground')}/>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium',task.status==='완료'&&'line-through text-muted-foreground')}>{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded',priorityStyle[task.priority])}>{priorityLabel[task.priority]}</span>
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',statusStyle[task.status])}>{task.status}</span>
                    {task.dueDate&&<span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="w-3 h-3"/>{task.dueDate}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
