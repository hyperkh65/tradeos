'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_APPROVALS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { Approval } from '@/types';

const statusStyle: Record<string,string> = { '작성':'bg-gray-100 text-gray-600', '진행 중':'bg-blue-100 text-blue-700', '승인':'bg-green-100 text-green-700', '반려':'bg-red-100 text-red-700' };

function Detail({ apr }: { apr: Approval }) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{apr.businessId}</p>
            <h2 className="text-lg font-bold mt-1">{apr.formTitle}</h2>
            <p className="text-sm text-muted-foreground">{apr.formType} · {apr.requesterName} · {new Date(apr.createdAt).toLocaleDateString('ko-KR')}</p>
          </div>
          <span className={cn('text-sm font-semibold px-3 py-1 rounded-full shrink-0',statusStyle[apr.status])}>{apr.status}</span>
        </div>

        <h3 className="text-sm font-semibold mb-3">결재 라인</h3>
        <div className="flex gap-3 mb-6">
          {apr.steps.map((step,i)=>(
            <div key={i} className="flex-1 border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                {step.status==='승인'?<CheckCircle2 className="w-4 h-4 text-green-600"/>:step.status==='반려'?<XCircle className="w-4 h-4 text-red-600"/>:<Clock className="w-4 h-4 text-muted-foreground"/>}
                <span className="text-xs font-medium">{step.approverName}</span>
              </div>
              <p className={cn('text-xs',step.status==='승인'?'text-green-700':step.status==='반려'?'text-red-700':'text-muted-foreground')}>{step.status}</p>
              {step.comment&&<p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{step.comment}&rdquo;</p>}
              {step.actedAt&&<p className="text-[11px] text-muted-foreground mt-1">{new Date(step.actedAt).toLocaleDateString('ko-KR')}</p>}
            </div>
          ))}
        </div>

        {apr.status==='진행 중'&&(
          <div className="flex gap-2">
            <Button variant="destructive" size="sm">반려</Button>
            <Button size="sm">승인</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [selected, setSelected] = useState<Approval>(DEMO_APPROVALS[0]);
  const [mobileDetail, setMobileDetail] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="결재" />

      {mobileDetail&&(
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="h-12 flex items-center px-4 border-b border-border shrink-0 gap-3">
            <button onClick={()=>setMobileDetail(false)} className="text-sm text-primary">← 목록</button>
            <span className="font-semibold text-sm truncate">{selected.formTitle}</span>
          </div>
          <Detail apr={selected}/>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border overflow-y-auto">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">결재 목록</span>
            <Button size="sm" className="h-7 gap-1 text-xs"><Plus className="w-3.5 h-3.5"/>기안</Button>
          </div>
          {DEMO_APPROVALS.map(apr=>(
            <button key={apr.id} onClick={()=>{setSelected(apr);setMobileDetail(true);}}
              className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0',selected?.id===apr.id&&'bg-primary/5 border-l-2 border-l-primary')}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-mono text-muted-foreground">{apr.businessId}</span>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0',statusStyle[apr.status])}>{apr.status}</span>
              </div>
              <p className="text-sm font-medium mt-1 line-clamp-2">{apr.formTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{apr.formType} · {new Date(apr.createdAt).toLocaleDateString('ko-KR')}</p>
            </button>
          ))}
        </div>

        <div className="flex-1 hidden md:flex overflow-hidden">
          {selected&&<Detail apr={selected}/>}
        </div>
      </div>
    </div>
  );
}
