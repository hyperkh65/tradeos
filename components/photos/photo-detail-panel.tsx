'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Tag as TagIcon, Send, Trash2, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhotoTag { id: string; name: string }
interface PhotoComment { id: string; userId: string; userName: string; content: string; createdAt: string }

interface PhotoDetailPanelProps {
  photoId: string;
  title: string | null;
  description: string | null;
  currentUserId: string | null;
  canEdit: boolean;
  onDescriptionSaved: (title: string | null, description: string | null) => void;
}

const fmtDateTime = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 사진 정보 패널의 태그/댓글/설명 편집 섹션 — 요청서 18~20번.
 * 즐겨찾기는 이미 뷰어(PhotoViewer)와 그리드 배지에서 처리 중이라 여긴 다루지 않는다. */
export function PhotoDetailPanel({ photoId, title, description, currentUserId, canEdit, onDescriptionSaved }: PhotoDetailPanelProps) {
  const [tags, setTags] = useState<PhotoTag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<PhotoTag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [editTitle, setEditTitle] = useState(title || '');
  const [editDescription, setEditDescription] = useState(description || '');
  const [savingDesc, setSavingDesc] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);

  const loadTags = useCallback(async () => {
    const res = await fetch(`/api/photos/${photoId}/tags`);
    const data = await res.json();
    setTags(data.tags || []);
  }, [photoId]);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/photos/${photoId}/comments`);
    const data = await res.json();
    setComments(data.comments || []);
  }, [photoId]);

  useEffect(() => {
    loadTags();
    loadComments();
    setEditingDesc(false);
    setEditTitle(title || '');
    setEditDescription(description || '');
  }, [photoId, loadTags, loadComments, title, description]);

  // 태그 자동완성(요청서 18번: 기존 태그 우선)
  useEffect(() => {
    if (!tagInput.trim()) { setTagSuggestions([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/photos/tags?q=${encodeURIComponent(tagInput.trim())}`);
      const data = await res.json();
      setTagSuggestions((data.tags || []).filter((t: PhotoTag) => !tags.some(x => x.id === t.id)));
    }, 200);
    return () => clearTimeout(t);
  }, [tagInput, tags]);

  const addTag = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTagInput('');
    setShowSuggestions(false);
    const res = await fetch(`/api/photos/${photoId}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) await loadTags();
  };

  const removeTag = async (tagId: string) => {
    setTags(prev => prev.filter(t => t.id !== tagId));
    await fetch(`/api/photos/${photoId}/tags/${tagId}`, { method: 'DELETE' });
  };

  const postComment = async () => {
    const content = commentInput.trim();
    if (!content || commentBusy) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/photos/${photoId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
      if (res.ok) { setCommentInput(''); await loadComments(); }
    } finally {
      setCommentBusy(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    await fetch(`/api/photos/${photoId}/comments/${commentId}`, { method: 'DELETE' });
  };

  const saveDescription = async () => {
    setSavingDesc(true);
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() || null, description: editDescription.trim() || null }),
      });
      if (res.ok) {
        onDescriptionSaved(editTitle.trim() || null, editDescription.trim() || null);
        setEditingDesc(false);
      }
    } finally {
      setSavingDesc(false);
    }
  };

  return (
    <div className="space-y-4 mt-3 pt-3 border-t border-border">
      {/* 제목/설명 편집 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground">제목 · 설명</span>
          {canEdit && !editingDesc && (
            <button onClick={() => setEditingDesc(true)} className="text-muted-foreground hover:text-foreground" title="편집">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-1.5">
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="제목"
              className="w-full text-xs border border-border rounded px-2 py-1 bg-background" />
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="설명"
              rows={3} className="w-full text-xs border border-border rounded px-2 py-1 bg-background resize-none" />
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setEditingDesc(false)} className="text-[11px] text-muted-foreground px-2 py-1">취소</button>
              <button onClick={saveDescription} disabled={savingDesc} className="text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 disabled:opacity-50">저장</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{description || '설명 없음'}</p>
        )}
      </div>

      {/* 태그 */}
      <div>
        <span className="text-[11px] font-semibold text-muted-foreground block mb-1">태그</span>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tags.map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 text-[11px] bg-muted rounded-full px-2 py-0.5">
              <TagIcon className="w-2.5 h-2.5" />{t.name}
              <button onClick={() => removeTag(t.id)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            ref={tagInputRef}
            value={tagInput}
            onChange={e => { setTagInput(e.target.value); setShowSuggestions(true); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } if (e.key === 'Escape') setShowSuggestions(false); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="태그 추가 후 Enter"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
          />
          {showSuggestions && tagSuggestions.length > 0 && (
            <div className="absolute z-20 top-full mt-0.5 w-full bg-popover border border-border rounded-md shadow-md max-h-32 overflow-y-auto">
              {tagSuggestions.map(t => (
                <button key={t.id} type="button" onMouseDown={() => addTag(t.name)}
                  className="block w-full text-left text-xs px-2 py-1 hover:bg-muted">{t.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 댓글 */}
      <div>
        <span className="text-[11px] font-semibold text-muted-foreground block mb-1">댓글 {comments.length > 0 && `(${comments.length})`}</span>
        <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
          {comments.length === 0 && <p className="text-[11px] text-muted-foreground">댓글이 없습니다</p>}
          {comments.map(c => (
            <div key={c.id} className="text-xs group">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.userName}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(c.createdAt)}</span>
                  {c.userId === currentUserId && (
                    <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap break-words">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input value={commentInput} onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
            placeholder="댓글 입력… @이름으로 멘션"
            className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background" />
          <button onClick={postComment} disabled={commentBusy || !commentInput.trim()}
            className={cn('shrink-0 p-1.5 rounded-md', commentInput.trim() ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground')}>
            {commentBusy ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
