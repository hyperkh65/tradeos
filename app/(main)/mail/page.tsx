'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail, Star, Search, Pencil, ArrowLeft, X, Send, Inbox,
  Plus, RefreshCw, Trash2, Paperclip, Clock,
  ChevronDown, CheckCircle2, AlertCircle, BookMarked, HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';

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
  from_email?: string | null;
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

interface MailContact {
  id: string;
  name: string;
  email: string;
}

interface ScheduledMail {
  id: string;
  account_id: string;
  to_addr: string;
  cc: string;
  bcc: string;
  subject: string;
  scheduled_at: string;
  status: string;
}

type Folder = 'inbox' | 'sent' | 'starred';
type ExtFolder = 'inbox' | 'sent';
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
  const [backing, setBacking] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [extFolder, setExtFolder] = useState<ExtFolder>('inbox');

  // Contacts (즐겨찾기)
  const [contacts, setContacts] = useState<MailContact[]>([]);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', scheduledAt: '', files: [] as File[] });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [scheduledMails, setScheduledMails] = useState<ScheduledMail[]>([]);
  const [showScheduled, setShowScheduled] = useState(false);

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
    fetch('/api/mail/contacts').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setContacts(d);
    }).catch(() => {});
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const data = await fetch('/api/mail/accounts').then(r => r.json()).catch(() => []);
    if (!Array.isArray(data)) return;
    setAccounts(data);
    if (data.length > 0) {
      const acc = data[0];
      setSource(acc.id);
      setExtFolder('inbox');
      const msgs = await fetch(`/api/mail/accounts/${acc.id}/messages?folder=inbox`).then(r => r.json()).catch(() => []);
      const list = Array.isArray(msgs) ? msgs : [];
      setExtMails(list);
      if (list.length === 0) {
        setSyncing(true);
        await fetch(`/api/mail/accounts/${acc.id}/sync?limit=0`, { method: 'POST' }).catch(() => {});
        const msgs2 = await fetch(`/api/mail/accounts/${acc.id}/messages?folder=inbox`).then(r => r.json()).catch(() => []);
        setExtMails(Array.isArray(msgs2) ? msgs2 : []);
        setSyncing(false);
      }
      const sched = await fetch(`/api/mail/accounts/${acc.id}/scheduled`).then(r => r.json()).catch(() => []);
      setScheduledMails(Array.isArray(sched) ? sched : []);
    }
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
  const loadExtMessages = useCallback(async (accountId: string, folder: ExtFolder = 'inbox') => {
    const data = await fetch(`/api/mail/accounts/${accountId}/messages?folder=${folder}`).then(r => r.json()).catch(() => []);
    setExtMails(Array.isArray(data) ? data : []);
  }, []);

  const syncAccount = async (accountId: string, folder: ExtFolder = 'inbox') => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      // limit=0 → 전체 동기화
      const res = await fetch(`/api/mail/accounts/${accountId}/sync?folder=${folder}&limit=0`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setSyncMsg({ type: 'error', text: json.error || `동기화 실패 (${res.status})` });
        setTimeout(() => setSyncMsg(null), 8000);
      } else {
        setSyncMsg({ type: 'success', text: `${json.count ?? 0}개 메일 동기화 완료` });
        setTimeout(() => setSyncMsg(null), 3000);
        await loadExtMessages(accountId, folder);
      }
    } catch (e) {
      setSyncMsg({ type: 'error', text: `연결 실패: ${(e as Error).message}` });
      setTimeout(() => setSyncMsg(null), 8000);
    } finally {
      setSyncing(false);
    }
  };

  const backupAccount = async (accountId: string) => {
    setBacking(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/mail/accounts/${accountId}/backup`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setSyncMsg({ type: 'error', text: json.error || '백업 실패' });
      } else {
        setSyncMsg({ type: 'success', text: `NAS 백업 완료: ${json.count}개 (${json.size})` });
      }
      setTimeout(() => setSyncMsg(null), 5000);
    } catch (e) {
      setSyncMsg({ type: 'error', text: `백업 실패: ${(e as Error).message}` });
      setTimeout(() => setSyncMsg(null), 8000);
    } finally {
      setBacking(false);
    }
  };

  const changeExtFolder = async (f: ExtFolder) => {
    setExtFolder(f);
    setSelectedExt(null);
    setExtBody(null);
    if (source !== 'internal') await loadExtMessages(source, f);
  };

  const selectAccount = async (acc: MailAccount) => {
    setSource(acc.id);
    setExtFolder('inbox');
    setSelectedExt(null);
    setExtBody(null);
    const data = await fetch(`/api/mail/accounts/${acc.id}/messages?folder=inbox`).then(r => r.json()).catch(() => []);
    const msgs = Array.isArray(data) ? data : [];
    setExtMails(msgs);
    if (msgs.length === 0) await syncAccount(acc.id, 'inbox');
    loadScheduled(acc.id);
    triggerScheduled(acc.id);
  };

  const selectExtMail = async (msg: ExtMail) => {
    setSelectedExt(msg);
    setExtBody(null);
    setMobileDetail(true);
    if (!msg.body_text) {
      const res = await fetch(`/api/mail/accounts/${msg.account_id}/messages?folder=${extFolder}`, {
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

  const loadContacts = async () => {
    const d = await fetch('/api/mail/contacts').then(r => r.json()).catch(() => []);
    if (Array.isArray(d)) setContacts(d);
  };

  const saveContact = async (name: string, email: string) => {
    await fetch('/api/mail/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    loadContacts();
  };

  const deleteContact = async (id: string) => {
    await fetch('/api/mail/contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadContacts();
  };

  const defaultCompose = { to: '', cc: '', bcc: '', subject: '', body: '', scheduledAt: '', files: [] as File[] };

  // ── Scheduled mails ──
  const loadScheduled = useCallback(async (accountId: string) => {
    const data = await fetch(`/api/mail/accounts/${accountId}/scheduled`).then(r => r.json()).catch(() => []);
    setScheduledMails(Array.isArray(data) ? data : []);
  }, []);

  const triggerScheduled = useCallback(async (accountId: string) => {
    await fetch(`/api/mail/accounts/${accountId}/scheduled`, { method: 'POST' }).catch(() => {});
    await loadScheduled(accountId);
  }, [loadScheduled]);

  const cancelScheduled = async (accountId: string, mailId: string) => {
    await fetch(`/api/mail/accounts/${accountId}/scheduled`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailId }),
    });
    loadScheduled(accountId);
  };

  // ── Compose ──
  const handleSend = async () => {
    if (!compose.to || !compose.subject.trim()) return;
    setSending(true);
    setSendError('');
    setSendSuccess('');

    if (source !== 'internal') {
      const fd = new FormData();
      fd.append('to', compose.to);
      fd.append('cc', compose.cc);
      fd.append('bcc', compose.bcc);
      fd.append('subject', compose.subject);
      fd.append('body', compose.body);
      if (compose.scheduledAt) fd.append('scheduled_at', compose.scheduledAt);
      compose.files.forEach(f => fd.append('file', f));

      const res = await fetch(`/api/mail/accounts/${source}/send`, {
        method: 'POST',
        body: fd,
      }).then(r => r.json()).catch(() => ({ error: '네트워크 오류' }));
      setSending(false);
      if (res.error) { setSendError(res.error); return; }
      if (res.scheduled) {
        setSendSuccess(`예약 완료: ${new Date(res.scheduled_at).toLocaleString('ko-KR')}`);
        loadScheduled(source);
        setTimeout(() => { setShowCompose(false); setCompose(defaultCompose); setSendSuccess(''); }, 2000);
        return;
      }
    } else {
      const res = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_ids: [compose.to], subject: compose.subject, body: compose.body }),
      }).then(r => r.json()).catch(() => ({ error: '네트워크 오류' }));
      setSending(false);
      if (res.error) { setSendError(res.error); return; }
    }

    setShowCompose(false);
    setCompose(defaultCompose);
    setSendError('');
    if (source === 'internal') {
      if (folder === 'sent') loadInternal();
    } else {
      // 보낸편지함으로 전환하고 새로고침
      setExtFolder('sent');
      await loadExtMessages(source, 'sent');
    }
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
          success={sendSuccess}
          contacts={contacts}
          onChange={setCompose}
          onSend={handleSend}
          onSaveContact={saveContact}
          onDeleteContact={deleteContact}
          onClose={() => { setShowCompose(false); setCompose(defaultCompose); setSendError(''); setSendSuccess(''); }}
        />
      )}

      {/* Scheduled mail panel */}
      {showScheduled && source !== 'internal' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />예약 발송 목록</h3>
              <button onClick={() => setShowScheduled(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {scheduledMails.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">예약된 메일이 없습니다.</p>
              ) : scheduledMails.map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 border border-border rounded-lg mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.subject}</p>
                    <p className="text-xs text-muted-foreground">받는 사람: {m.to_addr}</p>
                    <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{new Date(m.scheduled_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <button onClick={() => cancelScheduled(source, m.id)} className="text-xs text-destructive hover:underline shrink-0">취소</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add account modal */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdded={() => { loadAccounts(); setShowAddAccount(false); }}
        />
      )}

      {/* Top control bar */}
      <div className="border-b border-border px-3 py-2 flex items-center gap-2 shrink-0 flex-wrap">
        {/* Account tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => source !== acc.id && selectAccount(acc)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
                source === acc.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <span className={cn('w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center shrink-0', PROVIDER_COLORS[acc.provider] ?? 'bg-gray-500')}>
                {PROVIDER_ICONS[acc.provider] ?? '✉'}
              </span>
              <span className="max-w-[140px] truncate">{acc.from_email || acc.email}</span>
              {source === acc.id && (
                <button onClick={e => deleteAccount(acc, e)} className="ml-0.5 text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              )}
            </button>
          ))}
          <button
            onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />계정 추가
          </button>
        </div>

        {/* Folder tabs (only when account selected) */}
        {source !== 'internal' && (
          <>
            <div className="h-4 w-px bg-border shrink-0" />
            <div className="flex gap-1">
              <button
                onClick={() => changeExtFolder('inbox')}
                className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  extFolder === 'inbox' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
              >
                <Inbox className="w-3.5 h-3.5" />받은편지함
              </button>
              <button
                onClick={() => changeExtFolder('sent')}
                className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  extFolder === 'sent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
              >
                <Send className="w-3.5 h-3.5" />보낸편지함
              </button>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="검색..." className="pl-8 h-7 w-40 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Actions */}
        <Button size="sm" className="h-7 gap-1 text-xs px-3" onClick={() => setShowCompose(true)}>
          <Pencil className="w-3.5 h-3.5" />새 메일
        </Button>
        {source !== 'internal' && (
          <>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs px-2.5" onClick={() => syncAccount(source, extFolder)} disabled={syncing}>
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              {syncing ? '동기화 중' : '동기화'}
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs px-2.5" onClick={() => backupAccount(source)} disabled={backing || syncing} title="NAS에 메일 백업">
              <HardDrive className={cn('w-3.5 h-3.5', backing && 'animate-pulse')} />
              {backing ? '백업 중' : '백업'}
            </Button>
            {syncMsg && (
              <span className={cn('text-xs px-2 py-0.5 rounded', syncMsg.type === 'error' ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50')}>
                {syncMsg.text}
              </span>
            )}
          </>
        )}
        {source !== 'internal' && scheduledMails.length > 0 && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs px-2.5" onClick={() => setShowScheduled(true)}>
            <Clock className="w-3.5 h-3.5" />{scheduledMails.length}
          </Button>
        )}
      </div>

      {/* Main 2-pane area */}
      <div className={cn('flex-1 flex overflow-hidden', mobileDetail ? 'hidden md:flex' : 'flex')}>
        {/* Mail list — fixed width */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-r border-border overflow-y-auto">
          {source === 'internal' ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Mail className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>메일 계정을 선택하거나 추가하세요</p>
              <button onClick={() => setShowAddAccount(true)} className="mt-3 text-xs text-primary hover:underline">
                + 계정 추가
              </button>
            </div>
          ) : filteredExt.length === 0 ? (
            <EmptyState />
          ) : (
            filteredExt.map(m => {
              const isSentFolder = extFolder === 'sent';
              const displayName = isSentFolder
                ? (() => { try { return (JSON.parse(m.to_json) as string[])[0] || '(수신자 없음)'; } catch { return '(수신자 없음)'; } })()
                : (m.from_name || m.from_email);
              const unread = m.is_read === 0 && !isSentFolder;
              return (
                <button
                  key={m.uid}
                  onClick={() => selectExtMail(m)}
                  className={cn('w-full text-left p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0', selectedExt?.uid === m.uid && 'bg-primary/5')}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', unread ? 'bg-primary' : 'bg-transparent')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('text-sm truncate', unread && 'font-semibold')}>{displayName}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {new Date(m.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </p>
                      </div>
                      <p className={cn('text-xs mt-0.5 truncate', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>{m.subject}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{isSentFolder ? '나' : m.from_email}</p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel — fills all remaining space */}
        <div className="flex-1 hidden md:flex flex-col overflow-hidden">
          {selectedExt
            ? <div className="flex-1 overflow-y-auto p-6"><ExtDetail msg={selectedExt} body={extBody} /></div>
            : <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Mail className="w-12 h-12 opacity-15" />
                <p className="text-sm">메일을 선택하세요</p>
              </div>
          }
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

function ComposeModal({ source, internalUsers, myId, compose, sending, error, success, contacts, onChange, onSend, onSaveContact, onDeleteContact, onClose }: {
  source: Source;
  internalUsers: InternalUser[];
  myId: string;
  compose: { to: string; cc: string; bcc: string; subject: string; body: string; scheduledAt: string; files: File[] };
  sending: boolean;
  error: string;
  success: string;
  contacts: MailContact[];
  onChange: (c: typeof compose) => void;
  onSend: () => void;
  onSaveContact: (name: string, email: string) => void;
  onDeleteContact: (id: string) => void;
  onClose: () => void;
}) {
  const isExternal = source !== 'internal';
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showContactDrop, setShowContactDrop] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    onChange({ ...compose, files: [...compose.files, ...newFiles] });
    e.target.value = '';
  };
  const removeFile = (i: number) => onChange({ ...compose, files: compose.files.filter((_, j) => j !== i) });
  const minSchedule = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  // 즐겨찾기 자동완성 필터 (마지막 쉼표 이후 텍스트로 검색)
  const toQuery = compose.to.split(',').pop()?.trim().toLowerCase() ?? '';
  const filteredContacts = contacts.filter(c =>
    toQuery.length === 0 ||
    c.email.toLowerCase().includes(toQuery) ||
    c.name.toLowerCase().includes(toQuery)
  );

  const selectContact = (c: MailContact) => {
    const parts = compose.to.split(',').map(s => s.trim()).filter(Boolean);
    parts[Math.max(0, parts.length - 1)] = c.email;
    onChange({ ...compose, to: parts.join(', ') });
    setShowContactDrop(false);
    setTimeout(() => toRef.current?.focus(), 0);
  };

  // 현재 to 필드의 단일 이메일 (즐겨찾기 저장용)
  const singleEmail = compose.to.split(',').map(s => s.trim()).filter(Boolean);
  const lastEmail = singleEmail[singleEmail.length - 1] ?? '';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lastEmail);
  const alreadySaved = contacts.find(c => c.email.toLowerCase() === lastEmail.toLowerCase());

  const handleSave = () => {
    if (!isValidEmail) return;
    onSaveContact(saveName, lastEmail);
    setShowSaveForm(false);
    setSaveName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h3 className="font-semibold">새 메일 작성</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 space-y-2">
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />발송 실패: {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{success}
              </div>
            )}

            {/* To + 즐겨찾기 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8 shrink-0">받는</span>
                {isExternal ? (
                  <div className="flex-1 relative">
                    <Input
                      ref={toRef}
                      className="h-8 text-sm w-full"
                      value={compose.to}
                      onChange={e => { onChange({ ...compose, to: e.target.value }); setShowContactDrop(true); }}
                      onFocus={() => setShowContactDrop(true)}
                      onBlur={() => setTimeout(() => setShowContactDrop(false), 180)}
                      placeholder="이메일 주소 (쉼표로 여러 명)"
                    />
                    {/* Dropdown */}
                    {showContactDrop && filteredContacts.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                        {filteredContacts.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={e => { e.preventDefault(); selectContact(c); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {(c.name || c.email)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              {c.name && <p className="text-sm font-medium truncate">{c.name}</p>}
                              <p className={cn('truncate', c.name ? 'text-xs text-muted-foreground' : 'text-sm')}>{c.email}</p>
                            </div>
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <select className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={compose.to} onChange={e => onChange({ ...compose, to: e.target.value })}>
                    <option value="">받는 사람 선택</option>
                    {internalUsers.filter(u => u.id !== myId).map(u => (
                      <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
                    ))}
                  </select>
                )}
                {isExternal && (
                  <div className="flex gap-1 shrink-0">
                    {/* 즐겨찾기 저장/삭제 버튼 */}
                    {isValidEmail && (
                      alreadySaved ? (
                        <button
                          onClick={() => onDeleteContact(alreadySaved.id)}
                          title="즐겨찾기 삭제"
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/50 text-yellow-400"
                        >
                          <Star className="w-4 h-4 fill-yellow-400" />
                        </button>
                      ) : (
                        <button
                          onClick={() => { setSaveName(''); setShowSaveForm(v => !v); }}
                          title="즐겨찾기에 추가"
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground hover:text-yellow-400"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )
                    )}
                    <button onClick={() => setShowCc(v => !v)} className={cn('text-[11px] px-1.5 py-0.5 rounded border transition-colors', showCc ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground')}>참조</button>
                    <button onClick={() => setShowBcc(v => !v)} className={cn('text-[11px] px-1.5 py-0.5 rounded border transition-colors', showBcc ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground')}>숨은참조</button>
                  </div>
                )}
              </div>

              {/* 즐겨찾기 저장 폼 */}
              {isExternal && showSaveForm && isValidEmail && !alreadySaved && (
                <div className="ml-10 flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                  <BookMarked className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder={`이름 (${lastEmail})`}
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    autoFocus
                  />
                  <button onClick={handleSave} className="text-xs text-primary hover:underline shrink-0">저장</button>
                  <button onClick={() => setShowSaveForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>

            {/* CC */}
            {isExternal && showCc && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8 shrink-0">참조</span>
                <Input className="flex-1 h-8 text-sm" value={compose.cc} onChange={e => onChange({ ...compose, cc: e.target.value })} placeholder="참조 이메일 주소" />
              </div>
            )}
            {isExternal && showBcc && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8 shrink-0">숨은참조</span>
                <Input className="flex-1 h-8 text-sm" value={compose.bcc} onChange={e => onChange({ ...compose, bcc: e.target.value })} placeholder="숨은참조 이메일 주소" />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8 shrink-0">제목</span>
              <Input className="flex-1 h-8 text-sm" value={compose.subject} onChange={e => onChange({ ...compose, subject: e.target.value })} placeholder="메일 제목" />
            </div>
          </div>

          {/* Body */}
          <div className="px-5 pt-3 pb-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[200px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              value={compose.body}
              onChange={e => onChange({ ...compose, body: e.target.value })}
              placeholder="메일 내용을 입력하세요..."
            />
          </div>

          {/* Attachments */}
          {isExternal && (
            <div className="px-5 pb-3 space-y-1.5">
              {compose.files.length > 0 && (
                <div className="space-y-1">
                  {compose.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/40 border border-border">
                      <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground">{f.size < 1024*1024 ? (f.size/1024).toFixed(0)+'KB' : (f.size/1024/1024).toFixed(1)+'MB'}</span>
                      <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground w-fit">
                <Paperclip className="w-3.5 h-3.5" />파일 첨부
                <input ref={fileRef} type="file" multiple className="hidden" onChange={addFiles} />
              </label>
            </div>
          )}

          {/* Scheduled */}
          {isExternal && (
            <div className="px-5 pb-4">
              <button onClick={() => setShowSchedule(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Clock className="w-3.5 h-3.5" />
                {compose.scheduledAt ? `예약: ${new Date(compose.scheduledAt).toLocaleString('ko-KR')}` : '예약 발송'}
                <ChevronDown className={cn('w-3 h-3 transition-transform', showSchedule && 'rotate-180')} />
              </button>
              {showSchedule && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="datetime-local"
                    className="flex-1 h-8 text-xs rounded-md border border-input bg-background px-2"
                    min={minSchedule}
                    value={compose.scheduledAt}
                    onChange={e => onChange({ ...compose, scheduledAt: e.target.value })}
                  />
                  {compose.scheduledAt && (
                    <button onClick={() => onChange({ ...compose, scheduledAt: '' })} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8" onClick={onClose}>취소</Button>
          <div className="flex-1" />
          <Button size="sm" className="h-8 gap-1.5 min-w-[100px]" onClick={onSend}
            disabled={sending || !compose.to || !compose.subject}>
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : compose.scheduledAt ? <><Clock className="w-3.5 h-3.5" />예약 발송</>
              : <><Send className="w-3.5 h-3.5" />발송</>}
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
  const [form, setForm] = useState({ email: '', password: '', from_email: '', imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587' });
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
                <label className="text-xs font-medium text-muted-foreground">이메일 주소 (인증 계정)</label>
                <Input className="mt-1 h-9" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="example@naver.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">발신자 이메일 <span className="text-muted-foreground/60">(선택 — 다른 주소로 보낼 때)</span></label>
                <Input className="mt-1 h-9" value={form.from_email} onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))} placeholder="예: hyperkh@ynk2014.com (비워두면 인증 계정 그대로)" />
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
              {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2 whitespace-pre-line">{error}</p>}
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
