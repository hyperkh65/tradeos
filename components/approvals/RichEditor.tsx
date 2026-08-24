'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Heading1, Heading2,
  Undo, Redo, ImageIcon, Table as TableIcon, Trash2,
} from 'lucide-react';

interface Props {
  content?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

export function RichEditor({ content = '', onChange, editable = true, placeholder = '내용을 입력하세요...', className }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  });

  if (!editor) return null;

  const ToolBtn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-muted transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );

  const handleImageInsert = () => {
    const url = prompt('이미지 URL 또는 붙여넣기:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={cn('border border-input rounded-lg overflow-hidden', className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게">
            <Bold className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임">
            <Italic className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="밑줄">
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선">
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="제목1">
            <Heading1 className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="제목2">
            <Heading2 className="w-3.5 h-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="글머리">
            <List className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록">
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="왼쪽">
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="가운데">
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="오른쪽">
            <AlignRight className="w-3.5 h-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <label title="이미지 업로드" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer">
            <ImageIcon className="w-3.5 h-3.5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          <ToolBtn onClick={handleImageInsert} title="이미지 URL">
            <span className="text-[10px] font-mono">URL</span>
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="표 삽입">
            <TableIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          {editor.isActive('table') && (
            <>
              <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="열 추가">
                <span className="text-[10px]">열+</span>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="행 추가">
                <span className="text-[10px]">행+</span>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()} title="표 삭제">
                <Trash2 className="w-3.5 h-3.5" />
              </ToolBtn>
            </>
          )}
          <div className="w-px h-4 bg-border mx-1" />
          <input
            type="color"
            title="글자 색상"
            className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
            onChange={e => editor.chain().focus().setColor(e.target.value).run()}
          />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="실행취소">
            <Undo className="w-3.5 h-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="다시실행">
            <Redo className="w-3.5 h-3.5" />
          </ToolBtn>
        </div>
      )}
      <EditorContent editor={editor} className="bg-background" />
    </div>
  );
}
