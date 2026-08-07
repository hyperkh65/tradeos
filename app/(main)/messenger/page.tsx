'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_CHANNELS, DEMO_MESSAGES } from '@/lib/demo-data';
import type { Channel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Hash, MessageSquare, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const channelIcon = (type: string) => type === 'dm' ? null : <Hash className="w-3.5 h-3.5"/>;

export default function MessengerPage() {
  const [activeChannel, setActiveChannel] = useState<Channel>(DEMO_CHANNELS[1]);
  const [input, setInput] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  const messages = DEMO_MESSAGES.filter(m => m.channelId === activeChannel.id);

  const handleSelect = (ch: Channel) => { setActiveChannel(ch); setMobileDetail(true); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="메신저" />

      {/* Mobile channel view */}
      {mobileDetail&&(
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="h-12 flex items-center px-4 border-b border-border shrink-0 gap-3">
            <button onClick={()=>setMobileDetail(false)}><ArrowLeft className="w-4 h-4 text-primary"/></button>
            <span className="font-semibold text-sm"># {activeChannel.name}</span>
          </div>
          <ChatArea messages={messages} input={input} setInput={setInput}/>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Channel list */}
        <div className="w-full md:w-56 shrink-0 border-r border-border flex flex-col overflow-hidden bg-sidebar">
          <div className="p-3 border-b border-sidebar-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">채널</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {DEMO_CHANNELS.map(ch=>(
              <button key={ch.id} onClick={()=>handleSelect(ch)}
                className={cn('w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent transition-colors',
                  activeChannel.id===ch.id?'bg-sidebar-primary text-sidebar-primary-foreground font-medium':'text-sidebar-foreground')}>
                {ch.type==='dm'
                  ? <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{ch.name[0]}</div>
                  : <Hash className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/>}
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop chat */}
        <div className="flex-1 hidden md:flex flex-col overflow-hidden">
          <div className="h-10 border-b border-border px-4 flex items-center gap-2 shrink-0">
            {channelIcon(activeChannel.type)||<div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{activeChannel.name[0]}</div>}
            <span className="text-sm font-semibold">{activeChannel.name}</span>
            {activeChannel.description&&<span className="text-xs text-muted-foreground">— {activeChannel.description}</span>}
          </div>
          <ChatArea messages={messages} input={input} setInput={setInput}/>
        </div>
      </div>
    </div>
  );
}

function ChatArea({ messages, input, setInput }: { messages: typeof DEMO_MESSAGES; input: string; setInput: (v:string)=>void }) {
  const initials = (name: string) => name[0];
  const colors = ['bg-blue-100 text-blue-700','bg-green-100 text-green-700','bg-purple-100 text-purple-700','bg-orange-100 text-orange-700'];
  const colorOf = (id: string) => colors[id.charCodeAt(id.length-1)%colors.length];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length===0&&(
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12 text-center">
            <MessageSquare className="w-8 h-8 mb-2 opacity-20 mx-auto"/>
            <p>아직 메시지가 없습니다.</p>
          </div>
        )}
        {messages.map(msg=>(
          <div key={msg.id} className="flex gap-3">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',colorOf(msg.senderId))}>
              {initials(msg.senderName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{msg.senderName}</span>
                <span className="text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <p className="text-sm mt-0.5 text-foreground">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            placeholder="메시지를 입력하세요..."
            className="flex-1 h-9"
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();setInput('');} }}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={()=>setInput('')}>
            <Send className="w-4 h-4"/>
          </Button>
        </div>
      </div>
    </div>
  );
}
