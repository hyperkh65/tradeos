'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Hash, MessageSquare, ArrowLeft, Plus, X, Paperclip, Trash2, FileText, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';

interface Channel {
  id: string;
  name: string;
  type: string;
  description?: string;
  member_ids_json?: string;
  created_by: string;
  created_at: string;
  status?: string;
  deleted_at?: string | null;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function AttachmentView({ msg }: { msg: Message }) {
  if (!msg.attachment_url) return null;
  const isImage = msg.attachment_type?.startsWith('image/');
  const isVideo = msg.attachment_type?.startsWith('video/');
  if (isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"><img src={msg.attachment_url} alt={msg.attachment_name || '첨부 이미지'} className="max-w-xs md:max-w-sm rounded-lg mt-1" /></a>;
  }
  if (isVideo) {
    return <video src={msg.attachment_url} controls className="max-w-xs md:max-w-sm rounded-lg mt-1" />;
  }
  return (
    <a
      href={msg.attachment_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors max-w-xs md:max-w-sm"
    >
      <FileText className="w-5 h-5 shrink-0 text-muted-foreground" />
      <span className="text-xs truncate flex-1">{msg.attachment_name}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(msg.attachment_size)}</span>
      <Download className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700'];
const colorOf = (id: string) => colors[id.charCodeAt(id.length - 1) % colors.length];

function ChatArea({
  channel,
  myId,
}: {
  channel: Channel;
  myId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDeleted = channel.status === 'deleted';

  const loadMessages = useCallback(async () => {
    const data = await fetch(`/api/messenger/messages?channelId=${channel.id}`).then(r => r.json());
    const msgs: Message[] = Array.isArray(data) ? data : [];
    setMessages(msgs.reverse());
  }, [channel.id]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    await fetch('/api/messenger/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: channel.id, content: input.trim() }),
    });
    setInput('');
    setSending(false);
    await loadMessages();
  };

  const handleFilePick = () => fileInputRef.current?.click();

  const sendFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('channelId', channel.id);
      formData.append('file', file);
      const res = await fetch('/api/messenger/messages/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || '파일 업로드에 실패했습니다.');
      }
      await loadMessages();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm text-center">
            <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
            <p>아직 메시지가 없습니다.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMine = msg.sender_id === myId;
          return (
            <div key={msg.id} className={cn('flex gap-3', isMine && 'flex-row-reverse')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0', colorOf(msg.sender_id))}>
                {msg.sender_name[0]}
              </div>
              <div className={cn('flex-1 min-w-0', isMine && 'items-end flex flex-col')}>
                <div className={cn('flex items-baseline gap-2', isMine && 'flex-row-reverse')}>
                  <span className="text-sm font-semibold">{msg.sender_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {msg.content && (
                  <p className={cn(
                    'text-sm mt-0.5 px-3 py-2 rounded-xl inline-block max-w-xs md:max-w-sm break-words',
                    isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  )}>{msg.content}</p>
                )}
                <AttachmentView msg={msg} />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 p-3 border-t border-border">
        {isDeleted ? (
          <p className="text-xs text-muted-foreground text-center py-1.5">삭제된 대화방입니다. 더 이상 메시지를 보낼 수 없습니다.</p>
        ) : (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ''; }} />
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={handleFilePick} disabled={uploading} title="사진/동영상/문서 첨부">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </Button>
            <Input
              placeholder="메시지를 입력하세요..."
              className="flex-1 h-9"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={send} disabled={sending}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessengerPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [myId, setMyId] = useState('');
  const [myRole, setMyRole] = useState('');
  const isAdmin = myRole === 'admin';

  const loadChannels = useCallback(async () => {
    const data = await fetch('/api/messenger/channels').then(r => r.json());
    const list: Channel[] = Array.isArray(data) ? data : [];
    setChannels(list);
    if (list.length > 0 && !active) setActive(list[0]);
  }, [active]);

  useEffect(() => {
    loadChannels();
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) { setMyId(j.user.id); setMyRole(j.user.role || ''); } }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await fetch('/api/messenger/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), type: 'public' }),
    });
    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    await loadChannels();
  };

  const handleSelect = (ch: Channel) => { setActive(ch); setMobileDetail(true); };

  const canDelete = (ch: Channel) => isAdmin || ch.created_by === myId;

  const handleDelete = async (ch: Channel) => {
    if (!confirm(`"${ch.name}" 대화방을 삭제할까요?\n\n대화 내용은 실제로 지워지지 않고, 일반 사용자에게만 더 이상 보이지 않습니다(관리자는 계속 조회 가능).`)) return;
    const res = await fetch(`/api/messenger/channels/${ch.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || '삭제에 실패했습니다.');
      return;
    }
    if (active?.id === ch.id) { setActive(null); setMobileDetail(false); }
    await loadChannels();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="메신저" />

      {mobileDetail && active && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="h-12 flex items-center px-4 border-b border-border shrink-0 gap-3">
            <button onClick={() => setMobileDetail(false)}><ArrowLeft className="w-4 h-4 text-primary" /></button>
            <Hash className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-sm">{active.name}</span>
            {active.status === 'deleted' && <span className="text-[10px] text-red-600 border border-red-200 bg-red-50 rounded px-1.5 py-0.5">삭제됨</span>}
            {canDelete(active) && active.status !== 'deleted' && (
              <button onClick={() => handleDelete(active)} className="ml-auto text-muted-foreground hover:text-red-600" title="대화방 삭제">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <ChatArea channel={active} myId={myId} />
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">채널 만들기</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">채널 이름</label>
                <Input className="mt-1 h-9" value={newName} onChange={e => setNewName(e.target.value)} placeholder="채널 이름" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">설명 (선택)</label>
                <Input className="mt-1 h-9" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="채널 설명" />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>취소</Button>
              <Button className="flex-1" onClick={handleCreate}>만들기</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-56 shrink-0 border-r border-border flex flex-col overflow-hidden bg-sidebar">
          <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">채널</p>
            <button onClick={() => setShowCreate(true)} className="text-muted-foreground hover:text-foreground">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {channels.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">채널이 없습니다.</p>
            )}
            {channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => handleSelect(ch)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent transition-colors',
                  active?.id === ch.id ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium' : 'text-sidebar-foreground'
                )}
              >
                <Hash className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className={cn('truncate', ch.status === 'deleted' && 'line-through opacity-60')}>{ch.name}</span>
                {ch.status === 'deleted' && <span className="text-[9px] text-red-600 shrink-0">삭제됨</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 hidden md:flex flex-col overflow-hidden">
          {active ? (
            <>
              <div className="h-10 border-b border-border px-4 flex items-center gap-2 shrink-0">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">{active.name}</span>
                {active.description && <span className="text-xs text-muted-foreground">— {active.description}</span>}
                {active.status === 'deleted' && <span className="text-[10px] text-red-600 border border-red-200 bg-red-50 rounded px-1.5 py-0.5">삭제됨</span>}
                {canDelete(active) && active.status !== 'deleted' && (
                  <button onClick={() => handleDelete(active)} className="ml-auto text-muted-foreground hover:text-red-600" title="대화방 삭제">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <ChatArea channel={active} myId={myId} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
