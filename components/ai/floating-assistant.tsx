'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send, Loader2, RotateCcw, Copy, Check, ExternalLink, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inferPageContext, extractDraftBlock, stripDraftBlock, SOURCE_TYPE_ROUTE, SOURCE_TYPE_LABEL, type DraftBlock } from '@/lib/ai/client-page-context';

interface AISourceRef { sourceType: string; sourceId: string; title: string; score?: number; businessId?: string }
interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; sources?: AISourceRef[]; pending?: boolean }

const SUGGESTIONS_DEFAULT = ['최근 등록된 클레임 중 미해결 건 알려줘', '검품 불량률이 높았던 제품 찾아줘', '이번 달 발주 현황 요약해줘'];
const SUGGESTIONS_BY_MODULE: Record<string, string[]> = {
  제품: ['이 제품과 관련된 과거 클레임이나 검품 이력 찾아줘', '유사한 제품이 있는지 찾아줘'],
  검품: ['이 공급업체의 최근 검품 이력 요약해줘', '불량 원인이 반복되는 패턴이 있는지 찾아줘'],
  클레임: ['비슷한 유형의 과거 클레임 사례 찾아줘', '클레임 대응 이메일 초안 작성해줘'],
  발주: ['이 공급업체와의 최근 발주 이력 알려줘'],
};

const FIELD_LABEL: Record<string, string> = {
  issueType: '문제유형', description: '내용', customerName: '고객사', supplierName: '공급업체',
  productName: '제품', claimAmount: '클레임금액', currency: '통화',
};

function DraftCard({ draft, pathname }: { draft: DraftBlock; pathname: string }) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const text = draft.content || (draft.fields ? Object.entries(draft.fields).map(([k, v]) => `${FIELD_LABEL[k] || k}: ${v}`).join('\n') : '');
  const canApplyHere = draft.type === 'claimDraft' && pathname.startsWith('/claims');

  return (
    <div className="mt-2 border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-2">
      <div className="text-xs font-medium text-primary">초안 미리보기{draft.title ? ` — ${draft.title}` : ''}</div>
      <div className="text-xs whitespace-pre-wrap bg-white border border-border rounded p-2 max-h-48 overflow-y-auto">{text}</div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="text-xs flex items-center gap-1 text-primary hover:underline"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '복사됨' : '복사하기'}
        </button>
        {canApplyHere && (
          <button
            onClick={() => { window.dispatchEvent(new CustomEvent('ai-apply-draft', { detail: draft })); setApplied(true); setTimeout(() => setApplied(false), 1500); }}
            className="text-xs flex items-center gap-1 text-primary hover:underline"
          >
            {applied ? <Check className="w-3 h-3" /> : null}
            {applied ? '적용됨 — 등록 모달 확인' : '이 화면에 적용'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">AI가 자동으로 등록하지 않습니다 — 내용을 확인한 뒤 직접 저장해 주세요.</p>
    </div>
  );
}

export function FloatingAssistant() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/ai/status').then(r => (r.ok ? r.json() : null)).then(j => { if (j) setEnabled(!!j.enabled); }).finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const pageContext = inferPageContext(pathname || '/');
  const suggestions = (pageContext.module && SUGGESTIONS_BY_MODULE[pageContext.module]) || SUGGESTIONS_DEFAULT;

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setInput('');
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const assistantId = `a-${Date.now()}`;
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', pending: true }]);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedAnyToken = false;

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId, pageContext }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || '답변을 가져오지 못했습니다.');
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const evt = JSON.parse(trimmedLine.slice(5).trim());
          if (evt.type === 'token') {
            receivedAnyToken = true;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + evt.delta, pending: false } : m));
          } else if (evt.type === 'done') {
            setConversationId(evt.conversationId);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources: evt.sources, pending: false } : m));
          } else if (evt.type === 'error') {
            setError(evt.message);
            setMessages(prev => prev.filter(m => m.id !== assistantId));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // 사용자가 중단 버튼을 눌렀거나 창을 닫음 — 지금까지 받은 내용은 그대로 남긴다.
        if (!receivedAnyToken) setMessages(prev => prev.filter(m => m.id !== assistantId));
        else setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, pending: false } : m));
      } else {
        setError('네트워크 오류로 답변을 가져오지 못했습니다.');
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [sending, conversationId, pageContext]);

  const stop = () => abortRef.current?.abort();

  const resetConversation = () => { abortRef.current?.abort(); setConversationId(undefined); setMessages([]); setError(null); };

  if (!checked || !enabled) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="AI 도우미 열기"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform hover:scale-105"
          style={{ marginBottom: 'env(safe-area-inset-bottom)', marginRight: 'env(safe-area-inset-right)' }}
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}

      {open && (
        <div
          className={cn(
            'fixed z-50 bg-white border border-border shadow-2xl flex flex-col',
            'inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl',
            'md:inset-auto md:bottom-5 md:right-5 md:w-96 md:h-[600px] md:rounded-2xl',
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              <Sparkles className="w-4 h-4 text-primary" />AI 도우미
            </div>
            <div className="flex items-center gap-1">
              <button onClick={resetConversation} title="새 대화" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><RotateCcw className="w-3.5 h-3.5" /></button>
              <button onClick={() => setOpen(false)} title="닫기" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">회사 자료를 찾아보고 업무 작성을 도와드려요. 무엇이든 물어보세요.</p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => send(s)} className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => {
              const draft = m.role === 'assistant' && !m.pending ? extractDraftBlock(m.content) : null;
              const displayText = draft ? stripDraftBlock(m.content) : m.content;
              return (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}>
                    {m.pending ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />자료 확인 중...</span>
                    ) : (
                      <>
                        {displayText || (draft ? '' : '(빈 응답)')}
                        {draft && <DraftCard draft={draft} pathname={pathname || ''} />}
                        {!!m.sources?.length && (
                          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                            <div className="text-[11px] text-muted-foreground">참고한 자료</div>
                            {m.sources.map((s, i) => {
                              const base = SOURCE_TYPE_ROUTE[s.sourceType];
                              const href = base && s.businessId ? `${base}?open=${encodeURIComponent(s.businessId)}` : undefined;
                              const label = `${SOURCE_TYPE_LABEL[s.sourceType] || s.sourceType} · ${s.title}`;
                              return href ? (
                                <a key={i} href={href} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 text-primary hover:underline">
                                  <ExternalLink className="w-3 h-3" />{label}
                                </a>
                              ) : (
                                <div key={i} className="text-[11px] text-muted-foreground">{label}</div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          </div>

          <div className="p-3 border-t border-border shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="무엇이든 물어보세요"
                rows={1}
                className="flex-1 resize-none text-sm border border-border rounded-lg px-3 py-2 max-h-24 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {sending ? (
                <button
                  onClick={stop}
                  title="중단"
                  className="w-11 h-11 shrink-0 rounded-lg bg-muted text-foreground flex items-center justify-center hover:bg-muted/70"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  className="w-11 h-11 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
