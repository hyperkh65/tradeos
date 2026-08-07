'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_DOCS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderOpen, Search, Upload, FileText, FileCheck, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const catColor: Record<string,string> = { '발주서':'bg-blue-50 text-blue-700', '검품보고서':'bg-purple-50 text-purple-700', '인증서':'bg-yellow-50 text-yellow-700', 'B/L':'bg-cyan-50 text-cyan-700', '계약서':'bg-green-50 text-green-700', '카탈로그':'bg-gray-100 text-gray-700' };

const backupIcon = (s: string) => s==='completed'?<CheckCircle className="w-3.5 h-3.5 text-green-600"/>:s==='pending'?<Clock className="w-3.5 h-3.5 text-yellow-600"/>:<XCircle className="w-3.5 h-3.5 text-red-600"/>;

const formatSize = (bytes: number) => bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)}MB`:bytes>=1024?`${(bytes/1024).toFixed(0)}KB`:`${bytes}B`;

const fileIcon = (type: string) => type.includes('pdf')?'📄':type.includes('word')||type.includes('doc')?'📝':'📎';

export default function FilesPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid'|'list'>('grid');

  const filtered = DEMO_DOCS.filter(d =>
    d.fileName.includes(search)||(d.category??'').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="파일" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="파일명, 카테고리 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="flex gap-1 ml-auto">
            <Button variant={view==='grid'?'secondary':'ghost'} size="icon" className="h-9 w-9" onClick={()=>setView('grid')}>
              <span className="text-xs font-bold">⊞</span>
            </Button>
            <Button variant={view==='list'?'secondary':'ghost'} size="icon" className="h-9 w-9" onClick={()=>setView('list')}>
              <span className="text-xs font-bold">≡</span>
            </Button>
          </div>
          <Button size="sm" className="h-9 gap-1 shrink-0"><Upload className="w-4 h-4"/><span className="hidden sm:inline">업로드</span></Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-foreground">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">전체 파일</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-600">{filtered.filter(d=>d.backupStatus==='completed').length}</p>
            <p className="text-xs text-muted-foreground">백업 완료</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-600">{filtered.filter(d=>d.backupStatus==='pending').length}</p>
            <p className="text-xs text-muted-foreground">백업 대기</p>
          </div>
        </div>

        {view==='grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(doc=>(
              <div key={doc.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer group">
                <div className="text-3xl mb-3 text-center">{fileIcon(doc.fileType)}</div>
                <p className="text-xs font-medium text-foreground text-center truncate mb-1">{doc.fileName}</p>
                <p className="text-[11px] text-muted-foreground text-center">{formatSize(doc.fileSizeByte)}</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  {doc.category&&<span className={cn('text-[10px] px-1.5 py-0.5 rounded-full',catColor[doc.category]??'bg-gray-100 text-gray-600')}>{doc.category}</span>}
                  {backupIcon(doc.backupStatus)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>{['파일명','카테고리','크기','업로드일','백업'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(doc=>(
                  <tr key={doc.id} className="hover:bg-muted/30 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileIcon(doc.fileType)}</span>
                        <span className="text-sm font-medium truncate max-w-[220px]">{doc.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {doc.category&&<span className={cn('text-xs px-2 py-0.5 rounded-full',catColor[doc.category]??'bg-gray-100 text-gray-600')}>{doc.category}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatSize(doc.fileSizeByte)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString('ko-KR')}</td>
                    <td className="px-4 py-3">{backupIcon(doc.backupStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30"/>파일이 없습니다.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
