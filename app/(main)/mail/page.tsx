'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Star, Search, Pencil, ArrowLeft, X, Send, Inbox, PaperclipIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

interface MailItem {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_ids_json: string;
  subject: string;
  body: string;
  read_by_json: string;
  starred_by_json: string;
  created_at: string;
}

interface User {
  id: string;
  name: string;
  department?: string;
}

type Folder = 'inbox' | 'sent' | 'starred';

export default function MailPage() {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [search, setSearch] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState('');
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch(`/api/mail?folder=${folder}`).then(r => r.json());
    setMails(Array.isArray(data) ? data : []);
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setMyId(j.user.id); }).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
  }, []);

  const isRead = (m: MailItem) => {
    try { return (JSON.parse(m.read_by_json) as string[]).includes(myId); } catch { return false; }
  };

  const isStarred = (m: MailItem) => {
    try { return (JSON.parse(m.starred_by_json) as string[]).includes(myId); } catch { return false; }
  };

  const toggleRead = async (m: MailItem) => {
    await fetch(`/api/mail/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    });
    load();
  };

  const toggleStar = async (e: React.MouseEvent, m: MailItem) => {
    e.stopPropagation();
    const action = isStarred(m) ? 'unstar' : 'star';
    await fetch(`/api/mail/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    load();
  };

  const handleSelect = async (m: MailItem) => {
    setSelected(m);
    setMobileDetail(true);
    if (!isRead(m)) await toggleRead(m);
  };

  const handleSend = async () => {
    if (!compose.to || !compose.subject.trim()) return;
    setSending(true);
    const receiver = users.find(u => u.id === compose.to);
    await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiver_ids: [compose.to],
        subject: compose.subject,
        body: compose.body,
      }),
    });
    setSending(false);
    setShowCompose(false);
    setCompose({ to: '', subject: '', body: '' });
    if (folder === 'sent') load();
  };

  const filtered = mails.filter(m =>
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    m.sender_name.toLowerCase().includes(search.toLowerCase())
  );

  const unreadCount = mails.filter(m => !isRead(m)).length;

  const folderItems: { key: Folder; label: string; icon: typeof Inbox }[] = [
    { key: 'inbox', label: '받은 편지함', icon: Inbox },
    { key: 'sent', label: '보낸 편지함', icon: Send },
    { key: 'starred', label: '중요 메일', icon: Star },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="메일" />

      {mobileDetail && selected && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
          <MailDetail mail={selected} myId={myId} onBack={() => setMobileDetail(false)} onStar={e => toggleStar(e, selected)} starred={isStarred(selected)} />
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold">새 메일 작성</h3>
              <button onClick={() => setShowCompose(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">받는 사람</label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={compose.to}
                  onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                >
                  <option value="">받는 사람 선택</option>
                  {users.filter(u => u.id !== myId).map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">제목</label>
                <Input className="mt-1 h-9" value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))} placeholder="메일 제목" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">내용</label>
                <textarea
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[160px] resize-none"
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  placeholder="메일 내용"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setShowCompose(false)}>취소</Button>
              <Button className="flex-1 gap-1.5" onClick={handleSend} disabled={sending}>
                <PaperclipIcon className="w-3.5 h-3.5" />발송
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="메일 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={() => setShowCompose(true)}>
              <Pencil className="w-3.5 h-3.5" />새 메일 작성
            </Button>
          </div>

          <div className="flex border-b border-border">
            {folderItems.map(f => (
              <button
                key={f.key}
                onClick={() => { setFolder(f.key); setSelected(null); }}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
                  folder === f.key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <f.icon className="w-3.5 h-3.5" />
                <span>{f.label.split(' ')[0]}</span>
                {f.key === 'inbox' && unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] rounded-full px-1 min-w-[16px] text-center">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
                메일이 없습니다.
              </div>
            )}
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => handleSelect(m)}
                className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0', selected?.id === m.id && 'bg-primary/5')}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', !isRead(m) ? 'bg-primary' : 'bg-transparent')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm truncate', !isRead(m) && 'font-semibold')}>
                        {folder === 'sent' ? (() => {
                          try {
                            const ids = JSON.parse(m.receiver_ids_json) as string[];
                            const u = users.find(u => ids.includes(u.id));
                            return u?.name ?? '수신자';
                          } catch { return '수신자'; }
                        })() : m.sender_name}
                      </p>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {new Date(m.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </p>
                    </div>
                    <p className={cn('text-xs mt-0.5 truncate', !isRead(m) ? 'text-foreground font-medium' : 'text-muted-foreground')}>{m.subject}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.body.slice(0, 60)}</p>
                  </div>
                  <button onClick={e => toggleStar(e, m)} className="shrink-0 mt-0.5">
                    <Star className={cn('w-3.5 h-3.5', isStarred(m) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground')} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 hidden md:flex overflow-hidden">
          {selected
            ? <MailDetail mail={selected} myId={myId} onStar={e => toggleStar(e, selected)} starred={isStarred(selected)} />
            : <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Mail className="w-10 h-10 opacity-20" />
                <p className="text-sm">메일을 선택하세요</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function MailDetail({
  mail,
  myId,
  onBack,
  onStar,
  starred,
}: {
  mail: MailItem;
  myId: string;
  onBack?: () => void;
  onStar: (e: React.MouseEvent) => void;
  starred: boolean;
}) {
  void myId;
  return (
    <div className="flex flex-col h-full w-full">
      {onBack && (
        <div className="p-3 border-b border-border shrink-0">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary">
            <ArrowLeft className="w-4 h-4" />목록
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold">{mail.subject}</h2>
          <button onClick={onStar} className="shrink-0 mt-1">
            <Star className={cn('w-4 h-4', starred ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground')} />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {mail.sender_name[0]}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{mail.sender_name}</p>
          </div>
          <p className="text-xs text-muted-foreground">{new Date(mail.created_at).toLocaleString('ko-KR')}</p>
        </div>
        <hr className="my-4 border-border" />
        <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{mail.body}</pre>
      </div>
    </div>
  );
}
