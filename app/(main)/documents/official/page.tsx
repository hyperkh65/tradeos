'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichEditor } from '@/components/approvals/RichEditor';
import { DocumentDeleteButton } from '@/components/documents/DocumentDeleteButton';
import { cn } from '@/lib/utils';
import { downloadFile } from '@/lib/tauri-print';
import {
  Plus, Search, Loader2, FileText, History, X, Save, Send, Printer,
} from 'lucide-react';

interface DocRow {
  id: string; businessId: string; docType: string; title: string; status: string;
  data: OfficialData; createdByName?: string; createdAt: string; updatedAt: string;
  history?: Array<{ at: string; by: string; action: string }>;
}
interface OfficialData {
  recipient?: string; recipientAddress?: string; sender?: string;
  issueDate?: string; contentHtml?: string; contact?: string;
}

const DEFAULT_GREETING = '<p>귀사의 무궁한 발전과 번창하심을 진심으로 기원합니다. 평소 당사 제품을 이용해 주시는 데 깊이 감사드립니다.</p><p></p>';

const emptyData = (): OfficialData => ({
  recipient: '', recipientAddress: '', sender: '', issueDate: new Date().toISOString().slice(0, 10), contentHtml: DEFAULT_GREETING, contact: '',
});

export default function OfficialDocumentsPage() {
  const [list, setList] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<DocRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [data, setData] = useState<OfficialData>(emptyData());
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [companyName, setCompanyName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/documents?type=official');
      const j = await r.json();
      setList(j.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/settings/company').then(r => r.json()).then(j => setCompanyName(j.data?.name || ''));
  }, []);

  const openNew = () => {
    setSelected(null);
    setTitle('');
    setData({ ...emptyData(), sender: companyName });
    setEditing(true);
  };

  const openEdit = (doc: DocRow) => {
    setSelected(doc);
    setTitle(doc.title);
    setData({ ...emptyData(), ...doc.data });
    setEditing(true);
  };

  const handleSave = async (status: 'draft' | 'issued') => {
    if (!title.trim()) { alert('제목을 입력해주세요.'); return; }
    setSaving(true);
    try {
      if (selected) {
        const r = await fetch(`/api/documents/${selected.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, data, status }),
        });
        const j = await r.json();
        setSelected(j.data);
      } else {
        const r = await fetch('/api/documents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType: 'official', title, data, status }),
        });
        const j = await r.json();
        setSelected(j.data);
      }
      setEditing(false);
      load();
    } finally { setSaving(false); }
  };

  const filtered = list.filter(d => !searchQ || d.title.includes(searchQ) || d.businessId.includes(searchQ));

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="공문서작성" />
      <div className="flex-1 flex overflow-hidden">
        {/* 목록 */}
        <div className={cn('flex flex-col border-r border-border bg-card transition-all', editing ? 'w-72 shrink-0' : 'flex-1 max-w-lg')}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="검색..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            </div>
            <Button size="sm" onClick={openNew} className="shrink-0 h-7 text-xs gap-1"><Plus className="w-3.5 h-3.5" />새 문서</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <FileText className="w-8 h-8 opacity-30" /><span>작성된 공문이 없습니다</span>
                <button onClick={openNew} className="text-xs text-blue-500 hover:underline">+ 새 공문 작성</button>
              </div>
            ) : filtered.map(d => (
              <div key={d.id}
                className={cn('px-3 py-2.5 border-b border-border cursor-pointer hover:bg-muted/40', selected?.id === d.id && !editing && 'bg-blue-50 border-l-2 border-l-blue-500')}
                onClick={() => { setSelected(d); setEditing(false); }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">{d.businessId}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', d.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {d.status === 'issued' ? '발행' : '작성중'}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{d.data?.issueDate || d.createdAt?.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium mt-0.5 truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">수신: {d.data?.recipient || '-'}</div>
                  </div>
                  <DocumentDeleteButton id={d.id} createdAt={d.createdAt} onDeleted={() => { if (selected?.id === d.id) setSelected(null); load(); }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 상세/편집 */}
        {(selected || editing) && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
              {selected && !editing && (
                <>
                  <span className="text-xs font-mono text-muted-foreground">{selected.businessId}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', selected.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {selected.status === 'issued' ? '발행' : '작성중'}
                  </span>
                  <span className="font-semibold text-sm truncate">{selected.title}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowHistory(true)}><History className="w-3.5 h-3.5" />히스토리</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => downloadFile(`/api/documents/${selected.id}/pdf`)}><Printer className="w-3.5 h-3.5" />PDF</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(selected)}>편집</Button>
                  </div>
                </>
              )}
              {editing && (
                <>
                  <span className="font-semibold text-sm">{selected ? selected.businessId : '새 공문 (저장 시 번호 자동부여)'}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(false); if (!selected) setSelected(null); }}>취소</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={saving} onClick={() => handleSave('draft')}><Save className="w-3.5 h-3.5" />임시저장</Button>
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={saving} onClick={() => handleSave('issued')}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}발행</Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {editing ? (
                <div className="max-w-3xl mx-auto space-y-4">
                  <Input placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} className="text-base font-semibold h-10" />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">수신</label>
                      <Input value={data.recipient || ''} onChange={e => setData(d => ({ ...d, recipient: e.target.value }))} placeholder="예: (주)알프스21" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">수신처 주소</label>
                      <Input value={data.recipientAddress || ''} onChange={e => setData(d => ({ ...d, recipientAddress: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">발신</label>
                      <Input value={data.sender || ''} onChange={e => setData(d => ({ ...d, sender: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">시행일자</label>
                      <Input type="date" value={data.issueDate || ''} onChange={e => setData(d => ({ ...d, issueDate: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">본문</label>
                    <RichEditor content={data.contentHtml || ''} onChange={html => setData(d => ({ ...d, contentHtml: html }))} placeholder="공문 내용을 작성하세요..." className="min-h-[400px]" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">담당자 (표기용)</label>
                    <Input value={data.contact || ''} onChange={e => setData(d => ({ ...d, contact: e.target.value }))} placeholder="예: 김현 팀장 (010-0000-0000)" className="max-w-sm" />
                  </div>
                </div>
              ) : selected && (
                <div className="max-w-3xl mx-auto bg-white border border-border rounded-lg p-10" id="official-print-area">
                  <div className="text-center mb-8">
                    <div className="text-lg font-bold">{selected.data.sender}</div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-6 border-b pb-3">
                    <span>문서번호: {selected.businessId}</span>
                    <span>시행일자: {selected.data.issueDate}</span>
                  </div>
                  <div className="text-sm space-y-1 mb-6">
                    <div>수신: {selected.data.recipient} {selected.data.recipientAddress && <span className="text-muted-foreground">({selected.data.recipientAddress})</span>}</div>
                    <div>발신: {selected.data.sender}</div>
                    <div className="font-semibold mt-2">제목: {selected.title}</div>
                  </div>
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selected.data.contentHtml || '' }} />
                  {selected.data.contact && (
                    <div className="mt-10 text-right text-sm text-muted-foreground">담당: {selected.data.contact}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showHistory && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowHistory(false)}>
          <div className="bg-card rounded-xl shadow-xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">변경 히스토리</span>
              <button onClick={() => setShowHistory(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(selected.history || []).slice().reverse().map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-b border-border/60 pb-2">
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{h.action}</span>
                  <span>{h.by}</span>
                  <span className="ml-auto text-muted-foreground">{new Date(h.at).toLocaleString('ko-KR')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
