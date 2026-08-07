'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_MAILS } from '@/lib/demo-data';
import type { MailItem } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Star, Search, Pencil, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const tagColor: Record<string,string> = { '공급업체':'bg-blue-50 text-blue-700', '고객사':'bg-green-50 text-green-700', '포워더':'bg-cyan-50 text-cyan-700', '관세사':'bg-orange-50 text-orange-700' };

function MailList({ mails, selected, onSelect }: { mails: MailItem[]; selected: MailItem | null; onSelect: (m: MailItem) => void }) {
  return (
    <div className="divide-y divide-border">
      {mails.map(m=>(
        <button key={m.id} onClick={()=>onSelect(m)} className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors',selected?.id===m.id&&'bg-primary/5')}>
          <div className="flex items-start gap-3">
            <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0',m.read?'bg-transparent':'bg-primary')}/>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-sm truncate',!m.read&&'font-semibold')}>{m.from}</p>
                <p className="text-xs text-muted-foreground shrink-0">{new Date(m.date).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</p>
              </div>
              <p className={cn('text-xs mt-0.5 truncate',!m.read?'text-foreground font-medium':'text-muted-foreground')}>{m.subject}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{m.preview}</p>
              {m.tag&&<span className={cn('inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-1',tagColor[m.tag]??'bg-gray-100 text-gray-600')}>{m.tag}</span>}
            </div>
            {m.starred&&<Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0 mt-0.5"/>}
          </div>
        </button>
      ))}
    </div>
  );
}

function MailDetail({ mail, onBack }: { mail: MailItem; onBack?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {onBack&&(
        <div className="p-3 border-b border-border shrink-0">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary"><ArrowLeft className="w-4 h-4"/>목록</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-lg font-bold mb-2">{mail.subject}</h2>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{mail.from[0]}</div>
          <div>
            <p className="text-sm font-medium">{mail.from}</p>
            <p className="text-xs text-muted-foreground">{mail.fromEmail}</p>
          </div>
          <p className="ml-auto text-xs text-muted-foreground">{new Date(mail.date).toLocaleString('ko-KR')}</p>
        </div>
        <hr className="my-4 border-border"/>
        <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{mail.body}</pre>
        <div className="mt-6 flex gap-2">
          <Button size="sm" variant="outline">답장</Button>
          <Button size="sm" variant="outline">전달</Button>
        </div>
      </div>
    </div>
  );
}

export default function MailPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const filtered = DEMO_MAILS.filter(m =>
    m.from.includes(search)||m.subject.includes(search)||m.preview.includes(search)
  );

  const unread = DEMO_MAILS.filter(m=>!m.read).length;

  const handleSelect = (m: MailItem) => { setSelected(m); setMobileDetail(true); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="메일" />

      {/* Mobile detail */}
      {mobileDetail&&selected&&(
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
          <MailDetail mail={selected} onBack={()=>setMobileDetail(false)}/>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
              <Input placeholder="메일 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs"><Pencil className="w-3.5 h-3.5"/>새 메일 작성</Button>
          </div>
          <div className="px-3 py-2 flex items-center justify-between border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">받은 편지함</span>
            {unread>0&&<span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">{unread}</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            <MailList mails={filtered} selected={selected} onSelect={handleSelect}/>
            {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><Mail className="w-8 h-8 mx-auto mb-2 opacity-30"/>메일이 없습니다.</div>}
          </div>
        </div>

        {/* Desktop detail */}
        <div className="flex-1 hidden md:flex overflow-hidden">
          {selected
            ? <MailDetail mail={selected}/>
            : <div className="flex-1 flex items-center justify-center text-muted-foreground"><Mail className="w-10 h-10 mb-2 opacity-20"/></div>
          }
        </div>
      </div>
    </div>
  );
}
