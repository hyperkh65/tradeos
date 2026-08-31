'use client';
import { useEffect, useState } from 'react';
import { triggerPrint, isTauri } from '@/lib/tauri-print';

export default function PrintPage() {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('doc_print_html');
    const title = sessionStorage.getItem('doc_print_title');
    if (raw) {
      setHtml(raw);
      sessionStorage.removeItem('doc_print_html');
      if (title) { document.title = title; sessionStorage.removeItem('doc_print_title'); }
      setTimeout(() => { triggerPrint(); }, 1000);
    }
  }, []);

  if (!html) return <div style={{ padding: 40, color: '#888', fontFamily: 'sans-serif' }}>로딩 중...</div>;

  return (
    <div>
      {isTauri() && (
        <div className="print-back-bar" style={{ padding: 12, borderBottom: '1px solid #e5e5e5' }}>
          <style>{'@media print { .print-back-bar { display: none !important; } }'}</style>
          <button type="button" onClick={() => window.history.back()}
            style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← 뒤로가기
          </button>
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
