'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail, Star, Search, Pencil, ArrowLeft, X, Send, Inbox,
  Plus, RefreshCw, Trash2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InternalMail {
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

interface ExtMail {
  id: string;
  account_id: string;
  uid: string;
  from_name: string | null;
  from_email: string;
  to_json: string;
  subject: string;
  body_text: string | null;
  date: string;
  is_read: number;
  is_starred: number;
}

interface MailAccount {
  id: string;
  provider: string;
  label: string;
  email: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
}

interface InternalUser {
  id: string;
  name: string;
  department?: string;
}

type Folder = 'inbox' | 'sent' | 'starred';
type Source = 'internal' | string; // string = account id

const PROVIDER_ICONS: Record<string, string> = {
  naver: 'N',
  daum: 'D',
  kakao: 'K',
  gmail: 'G',
  custom: '✉',
};
const PROVIDER_COLORS: Record<string, string> = {
  naver: 'bg-green-500',
  daum: 'bg-blue-500',
  kakao: 'bg-yellow-500',
  gmail: 'bg-red-500',
  custom: 'bg-gray-500',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MailPage() {
  const [source, setSource] = useState<Source>('internal');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [search, setSearch] = useState('');
  const [myId, setMyId] = useState('');

  // Internal mail
  const [internalMails, setInternalMails] = useState<InternalMail[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [selectedInternal, setSelectedInternal] = useState<InternalMail | null>(null);

  // External mail
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [extMails, setExtMails] = useState<ExtMail[]>([]);
  const [selectedExt, setSelectedExt] = useState<ExtMail | null>(null);
  const [extBody, setExtBody] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Add account modal
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Mobile detail view
  const [mobileDetail, setMobileDetail] = useState(false);

  // ── Init ──
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setMyId(j.user.id); }).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      setInternalUsers(list);
    }).catch(() => {});
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const data = await fetch('/api/mail/accounts').then(r => r.json()).catch(() => []);
    if (Array.isArray(data)) setAccounts(data);
  };

  // ── Internal mail ──
  const loadInternal = useCallback(async () => {
    const data = await fetch(`/api/mail?folder=${folder}`).then(r => r.json()).catch(() => []);
    setInternalMails(Array.isArray(data) ? data : []);
  }, [folder]);

  useEffect(() => {
    if (source === 'internal') loadInternal();
  }, [source, loadInternal]);

  // ── External mail ──
  const loadExtMessages = useCallback(async (accountId: string) => {
    const data = await fetch(`/api/mail/accounts/${accountId}/messages`).then(r => r.json()).catch(() => []);
    setExtMails(Array.isArray(data) ? data : []);
  }, []);

  const syncAccount = async (accountId: string) => {
    setSyncing(true);
    await fetch(`/api/mail/accounts/${accountId}/sync`, { method: 'POST' }).catch(() => {});
    await loadExtMessages(accountId);
    setSyncing(false);
  };

  const selectAccount = async (acc: MailAccount) => {
    setSource(acc.id);
    setSelectedExt(null);
    setExtBody(null);
    const data = await fetch(`/api/mail/accounts/${acc.id}/messages`).then(r => r.json()).catch(() => []);
    const msgs = Array.isArray(data) ? data : [];
    setExtMails(msgs);
    if (msgs.length === 0) await syncAccount(acc.id);
  };

  const selectExtMail = async (msg: ExtMail) => {
    setSelectedExt(msg);
    setExtBody(null);
    setMobileDetail(true);
    if (!msg.body_text) {
      const res = await fetch(`/api/mail/accounts/${msg.account_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: msg.uid }),
      }).then(r => r.json()).catch(() => ({}));
      setExtBody(res.body ?? '(본문을 불러올 수 없습니다)');
    } else {
      setExtBody(msg.body_text);
    }
  };

  const deleteAccount = async (acc: MailAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${acc.email} 계정을 삭제할까요?`)) return;
    await fetch(`/api/mail/accounts/${acc.id}`, { method: 'DELETE' });
    if (source === acc.id) setSource('internal');
    loadAccounts();
  };

  // ── Internal mail actions ──
  const isRead = (m: InternalMail) => {
    try { return (JSON.parse(m.read_by_json) as string[]).includes(myId); } catch { return false; }
  };
  const isStarred = (m: InternalMail) => {
    try { return (JSON.parse(m.starred_by_json) as string[]).includes(myId); } catch { return false; }
  };

  const toggleRead = async (m: InternalMail) => {
    await fetch(`/api/mail/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    });
    loadInternal();
  };

  const toggleStar = async (e: React.MouseEvent, m: InternalMail) => {
    e.stopPropagation();
    await fetch(`/api/mail/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: isStarred(m) ? 'unstar' : 'star' }),
    });
    loadInternal();
  };

  const selectInternal = async (m: InternalMail) => {
    setSelectedInternal(m);
    setMobileDetail(true);
    if (!isRead(m)) await toggleRead(m);
  };

  // ── Compose ──
  const handleSend = async () => {
    if (!compose.to || !compose.subject.trim()) return;
    setSending(true);
    setSendError('');

    if (source !== 'internal') {
      // External send
      const res = await fetch(`/api/mail/accounts/${source}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compose),
      }).then(r => r.json()).catch(() => ({ error: '네트워크 오류' }));
      setSending(false);
      if (res.error) { setSendError(res.error); return; }
    } else {
      // Internal send
      const res = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_ids: [compose.to],
          subject: compose.subject,
          body: compose.body,
        }),
      }).then(r => r.json()).catch(() => ({ error: '네트워크 오류' }));
      setSending(false);
      if (res.error) { setSendError(res.error); return; }
    }

    setShowCompose(false);
    setCompose({ to: '', subject: '', body: '' });
    setSendError('');
    if (source === 'internal' && folder === 'sent') loadInternal();
  };

  // ── Render ──
  const currentAccount = accounts.find(a => a.id === source);
  const unreadCount = internalMails.filter(m => !isRead(m)).length;

  const filteredInternal = internalMails.filter(m =>
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    m.sender_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredExt = extMails.filter(m =>
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    (m.from_email + (m.from_name ?? '')).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="메일" />

      {/* Mobile detail overlay */}
      {mobileDetail && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border shrink-0 flex items-center gap-2">
            <button onClick={() => setMobileDetail(false)} className="flex items-center gap-1 text-sm text-primary">
              <ArrowLeft className="w-4 h-4" />목록
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {source === 'internal' && selectedInternal && (
              <InternalDetail mail={selectedInternal} myId={myId} starred={isStarred(selectedInternal)} onStar={e => toggleStar(e, selectedInternal)} />
            )}
            {source !== 'internal' && selectedExt && (
              <ExtDetail msg={selectedExt} body={extBody} />
            )}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal
          source={source}
          internalUsers={internalUsers}
          myId={myId}
          compose={compose}
          sending={sending}
          error={sendError}
          onChange={setCompose}
          onSend={handleSend}
          onClose={() => { setShowCompose(false); setCompose({ to: '', subject: '', body: '' }); setSendError(''); }}
        />
      )}

      {/* Add account modal */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdded={() => { loadAccounts(); setShowAddAccount(false); }}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          {/* Search + compose */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="메일 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={() => setShowCompose(true)}>
              <Pencil className="w-3.5 h-3.5" />새 메일 작성
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Internal mail section */}
            <div className="px-2 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-muted-foreground px-2 uppercase tracking-wider mb-1">내부 메일</p>
              {(['inbox', 'sent', 'starred'] as Folder[]).map(f => {
                const icons = { inbox: Inbox, sent: Send, starred: Star };
                const labels = { inbox: '받은편지함', sent: '보낸편지함', starred: '중요메일' };
                const Icon = icons[f];
                const active = source === 'internal' && folder === f;
                return (
                  <button
                    key={f}
                    onClick={() => { setSource('internal'); setFolder(f); setSelectedInternal(null); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                      active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-left">{labels[f]}</span>
                    {f === 'inbox' && unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 min-w-[18px] text-center">{unreadCount}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* External accounts section */}
            <div className="px-2 pt-4 pb-2">
              <p className="text-[10px] font-semibold text-muted-foreground px-2 uppercase tracking-wider mb-1">외부 메일 계정</p>
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => selectAccount(acc)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors group',
                    source === acc.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <span className={cn('w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center shrink-0', PROVIDER_COLORS[acc.provider] ?? 'bg-gray-500')}>
                    {PROVIDER_ICONS[acc.provider] ?? '✉'}
                  </span>
                  <span className="flex-1 text-left truncate text-xs">{acc.email}</span>
                  {source === acc.id
                    ? <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                    : <button onClick={e => deleteAccount(acc, e)} className="hidden group-hover:flex w-4 h-4 items-center justify-center shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                  }
                </button>
              ))}
              <button
                onClick={() => setShowAddAccount(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mt-0.5"
              >
                <Plus className="w-3.5 h-3.5" />계정 추가
              </button>
            </div>
          </div>
        </div>

        {/* Mail list */}
        <div className={cn('flex-1 flex flex-col overflow-hidden', mobileDetail ? 'hidden md:flex' : 'flex')}>
          {/* External mail toolbar */}
          {source !== 'internal' && currentAccount && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
              <span className={cn('w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center shrink-0', PROVIDER_COLORS[currentAccount.provider] ?? 'bg-gray-500')}>
                {PROVIDER_ICONS[currentAccount.provider] ?? '✉'}
              </span>
              <span className="text-sm font-medium flex-1">{currentAccount.email}</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => syncAccount(source)} disabled={syncing}>
                <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
                {syncing ? '동기화 중...' : '동기화'}
              </Button>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* List panel */}
            <div className="w-full md:w-72 lg:w-80 shrink-0 md:border-r border-border overflow-y-auto">
              {source === 'internal' ? (
                filteredInternal.length === 0
                  ? <EmptyState />
                  : filteredInternal.map(m => (
                      <button
                        key={m.id}
                        onClick={() => selectInternal(m)}
                        className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0', selectedInternal?.id === m.id && 'bg-primary/5')}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', !isRead(m) ? 'bg-primary' : 'bg-transparent')} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={cn('text-sm truncate', !isRead(m) && 'font-semibold')}>
                                {folder === 'sent' ? (() => {
                                  try {
                                    const ids = JSON.parse(m.receiver_ids_json) as string[];
                                    return internalUsers.find(u => ids.includes(u.id))?.name ?? '수신자';
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
                    ))
              ) : (
                filteredExt.length === 0
                  ? <EmptyState />
                  : filteredExt.map(m => (
                      <button
                        key={m.uid}
                        onClick={() => selectExtMail(m)}
                        className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0', selectedExt?.uid === m.uid && 'bg-primary/5')}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', m.is_read === 0 ? 'bg-primary' : 'bg-transparent')} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={cn('text-sm truncate', m.is_read === 0 && 'font-semibold')}>
                                {m.from_name || m.from_email}
                              </p>
                              <p className="text-xs text-muted-foreground shrink-0">
                                {new Date(m.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                              </p>
                            </div>
                            <p className={cn('text-xs mt-0.5 truncate', m.is_read === 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>{m.subject}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{m.from_email}</p>
                          </div>
                        </div>
                      </button>
                    ))
              )}
            </div>

            {/* Detail panel (desktop) */}
            <div className="flex-1 hidden md:flex overflow-hidden">
              {source === 'internal' && selectedInternal
                ? <div className="flex-1 overflow-y-auto p-5"><InternalDetail mail={selectedInternal} myId={myId} starred={isStarred(selectedInternal)} onStar={e => toggleStar(e, selectedInternal)} /></div>
                : source !== 'internal' && selectedExt
                  ? <div className="flex-1 overflow-y-auto p-5"><ExtDetail msg={selectedExt} body={extBody} /></div>
                  : <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <Mail className="w-10 h-10 opacity-20" />
                      <p className="text-sm">메일을 선택하세요</p>
                    </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
      메일이 없습니다.
    </div>
  );
}

function InternalDetail({ mail, myId, starred, onStar }: {
  mail: InternalMail; myId: string; starred: boolean; onStar: (e: React.MouseEvent) => void;
}) {
  void myId;
  return (
    <>
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
      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{mail.body}</pre>
    </>
  );
}

function ExtDetail({ msg, body }: { msg: ExtMail; body: string | null }) {
  const isHtml = body ? (/<[a-zA-Z][\s\S]*>/.test(body.slice(0, 500))) : false;

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-bold">{msg.subject}</h2>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {(msg.from_name || msg.from_email)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{msg.from_name || msg.from_email}</p>
          {msg.from_name && <p className="text-xs text-muted-foreground truncate">{msg.from_email}</p>}
        </div>
        <p className="text-xs text-muted-foreground shrink-0">{new Date(msg.date).toLocaleString('ko-KR')}</p>
      </div>
      <hr className="my-4 border-border" />
      {body === null
        ? <p className="text-sm text-muted-foreground">본문 불러오는 중...</p>
        : isHtml
          ? <iframe
              srcDoc={body}
              className="w-full border-0 rounded"
              style={{ minHeight: '500px' }}
              sandbox="allow-same-origin"
              onLoad={e => {
                const iframe = e.currentTarget;
                const h = iframe.contentDocument?.body?.scrollHeight;
                if (h) iframe.style.height = h + 40 + 'px';
              }}
            />
          : <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
      }
    </>
  );
}

function ComposeModal({ source, internalUsers, myId, compose, sending, error, onChange, onSend, onClose }: {
  source: Source;
  internalUsers: InternalUser[];
  myId: string;
  compose: { to: string; subject: string; body: string };
  sending: boolean;
  error: string;
  onChange: (c: { to: string; subject: string; body: string }) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const isExternal = source !== 'internal';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold">새 메일 작성</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              발송 실패: {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">받는 사람</label>
            {isExternal
              ? <Input className="mt-1 h-9" value={compose.to} onChange={e => onChange({ ...compose, to: e.target.value })} placeholder="받는 이메일 주소" />
              : <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={compose.to}
                  onChange={e => onChange({ ...compose, to: e.target.value })}
                >
                  <option value="">받는 사람 선택</option>
                  {internalUsers.filter(u => u.id !== myId).map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
                  ))}
                </select>
            }
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">제목</label>
            <Input className="mt-1 h-9" value={compose.subject} onChange={e => onChange({ ...compose, subject: e.target.value })} placeholder="메일 제목" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">내용</label>
            <textarea
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[160px] resize-none"
              value={compose.body}
              onChange={e => onChange({ ...compose, body: e.target.value })}
              placeholder="메일 내용"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button className="flex-1 gap-1.5" onClick={onSend} disabled={sending || !compose.to || !compose.subject}>
            <Send className="w-3.5 h-3.5" />발송
          </Button>
        </div>
      </div>
    </div>
  );
}

const PROVIDER_LIST = [
  { id: 'naver', label: '네이버', color: 'bg-green-500', help: '네이버 메일 → 환경설정 → POP3/IMAP 설정에서 IMAP 사용을 켜세요.' },
  { id: 'daum', label: '다음', color: 'bg-blue-500', help: '다음 메일(@daum.net, @hanmail.net)은 별도 설정 없이 바로 연결됩니다.' },
  { id: 'kakao', label: '카카오', color: 'bg-yellow-500', help: '카카오메일 → 설정 → IMAP 사용을 켜세요. 비밀번호는 카카오 계정 비밀번호를 입력하세요.' },
  { id: 'gmail', label: 'Gmail', color: 'bg-red-500', help: 'Google 계정 → 보안 → 2단계 인증 켜기 → 앱 비밀번호 발급 후 입력하세요.' },
  { id: 'custom', label: '직접 입력', color: 'bg-gray-500', help: '다음 기업메일(@ynk2014.com 등)은 IMAP: imap.daum.net / SMTP: smtp.daum.net 으로 입력하세요.' },
];

const PROVIDER_DEFAULTS: Record<string, { imap: string; imapPort: number; smtp: string; smtpPort: number }> = {
  naver:  { imap: 'imap.naver.com',  imapPort: 993, smtp: 'smtp.naver.com',  smtpPort: 587 },
  daum:   { imap: 'imap.daum.net',   imapPort: 993, smtp: 'smtp.daum.net',   smtpPort: 465 },
  kakao:  { imap: 'imap.kakao.com',  imapPort: 993, smtp: 'smtp.kakao.com',  smtpPort: 465 },
  gmail:  { imap: 'imap.gmail.com',  imapPort: 993, smtp: 'smtp.gmail.com',  smtpPort: 587 },
  custom: { imap: '', imapPort: 993, smtp: '', smtpPort: 587 },
};

function AddAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [step, setStep] = useState<'provider' | 'form'>('provider');
  const [provider, setProvider] = useState('');
  const [form, setForm] = useState({ email: '', password: '', imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectProvider = (id: string) => {
    setProvider(id);
    const d = PROVIDER_DEFAULTS[id];
    setForm(f => ({ ...f, imap_host: d.imap, imap_port: String(d.imapPort), smtp_host: d.smtp, smtp_port: String(d.smtpPort) }));
    setStep('form');
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/mail/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...form }),
    }).then(r => r.json()).catch(() => ({ error: '네트워크 오류' }));
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onAdded();
  };

  const providerInfo = PROVIDER_LIST.find(p => p.id === provider);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button onClick={() => setStep('provider')} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="font-semibold">{step === 'provider' ? '메일 계정 추가' : '계정 정보 입력'}</h3>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'provider' ? (
            <div className="grid grid-cols-2 gap-3">
              {PROVIDER_LIST.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProvider(p.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <span className={cn('w-10 h-10 rounded-full text-white font-bold text-lg flex items-center justify-center', p.color)}>
                    {PROVIDER_ICONS[p.id] ?? '✉'}
                  </span>
                  <span className="text-sm font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {providerInfo?.help && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                  {providerInfo.help}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">이메일 주소</label>
                <Input className="mt-1 h-9" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="example@naver.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {provider === 'gmail' ? '앱 비밀번호 (일반 비밀번호 X)' : '비밀번호'}
                </label>
                <Input className="mt-1 h-9" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="비밀번호" />
              </div>
              {provider === 'custom' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">IMAP 서버</label>
                      <Input className="mt-1 h-9" value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="imap.example.com" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">포트</label>
                      <Input className="mt-1 h-9" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: e.target.value }))} placeholder="993" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">SMTP 서버</label>
                      <Input className="mt-1 h-9" value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.example.com" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">포트</label>
                      <Input className="mt-1 h-9" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: e.target.value }))} placeholder="587" />
                    </div>
                  </div>
                </>
              )}
              {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="px-5 py-4 border-t border-border shrink-0">
            <Button className="w-full" onClick={handleConnect} disabled={loading || !form.email || !form.password}>
              {loading ? '연결 확인 중...' : '연결하기'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
