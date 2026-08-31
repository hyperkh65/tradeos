'use client';

import { X, Download, Printer } from 'lucide-react';
import { triggerPrint } from '@/lib/tauri-print';

interface FilePreviewModalProps {
  url: string;
  name: string;
  onClose: () => void;
}

/**
 * 첨부파일 다운로드 아이콘을 누르면 뜨는 미리보기 모달 — 화면 이동 없이 같은 창 안에서
 * 열리고(Tauri WKWebView는 새 창/새 탭을 못 띄우므로), 인쇄·다운로드·닫기(뒤로가기 역할)
 * 세 가지를 모두 여기서 처리한다.
 */
export function FilePreviewModal({ url, name, onClose }: FilePreviewModalProps) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';

  const handleDownload = async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex flex-col" onClick={onClose}>
      <style>{'@media print { .file-preview-chrome { display: none !important; } }'}</style>
      <div className="file-preview-chrome flex items-center justify-between px-4 py-3 bg-black/60 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-white text-sm font-medium truncate flex-1 mr-4">{name}</span>
        <div className="flex gap-2">
          {(isImg || isPdf) && (
            <button onClick={() => triggerPrint()}
              className="flex items-center gap-1.5 text-xs text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors">
              <Printer className="w-3.5 h-3.5" />인쇄
            </button>
          )}
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors">
            <Download className="w-3.5 h-3.5" />다운로드
          </button>
          <button onClick={onClose} className="text-white hover:text-gray-300 ml-2" title="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div id="file-preview-print-area" className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={e => e.stopPropagation()}>
        {isImg ? (
          <img src={url} alt={name} className="max-w-full max-h-full object-contain rounded shadow-xl" />
        ) : isPdf ? (
          <iframe src={url} className="w-full h-full rounded bg-white" title={name} />
        ) : (
          <div className="text-center text-white">
            <p className="text-sm mb-4">{name}</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 text-sm text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-md mx-auto transition-colors">
              <Download className="w-4 h-4" />파일 다운로드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
