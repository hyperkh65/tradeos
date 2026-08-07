import { AppHeader } from '@/components/layout/header';
import { DEMO_TASKS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckSquare, Plus, Clock, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const priorityStyle: Record<string, string> = { urgent: 'bg-red-100 text-red-700 border-red-200', high: 'bg-orange-100 text-orange-700 border-orange-200', medium: 'bg-yellow-100 text-yellow-700 border-yellow-200', low: 'bg-gray-100 text-gray-600 border-gray-200' };
const priorityLabel: Record<string, string> = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const statusStyle: Record<string, string> = { '해야 함': 'bg-gray-100 text-gray-700', '진행 중': 'bg-blue-100 text-blue-700', '대기': 'bg-yellow-100 text-yellow-700', '완료': 'bg-green-100 text-green-700' };

export default function TasksPage() {
  const byStatus = ['해야 함', '진행 중', '대기', '완료'] as const;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="내 업무" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex justify-end mb-5">
          <Button size="sm" className="h-9 gap-1"><Plus className="w-4 h-4" /> 새 업무</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {byStatus.map((status) => {
            const tasks = DEMO_TASKS.filter(t => t.status === status);
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[status])}>{status}</span>
                  <span className="text-xs text-muted-foreground">{tasks.length}</span>
                </div>
                {tasks.map((task) => (
                  <div key={task.id} className="border border-border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow cursor-pointer space-y-2">
                    <div className="flex items-start gap-2">
                      <span className={cn('shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border', priorityStyle[task.priority])}>
                        {priorityLabel[task.priority]}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {task.dueDate && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.dueDate}</span>
                      )}
                      {task.relatedName && (
                        <span className="flex items-center gap-1 truncate"><LinkIcon className="w-3 h-3 shrink-0" />{task.relatedName}</span>
                      )}
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div className="border border-dashed border-border rounded-lg p-4 text-center text-xs text-muted-foreground">
                    업무 없음
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
