'use client';
import { useEffect, useState } from 'react';

export default function PrintPage() {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('doc_print_html');
    const title = sessionStorage.getItem('doc_print_title');
    if (raw) {
      setHtml(raw);
      sessionStorage.removeItem('doc_print_html');
      if (title) { document.title = title; sessionStorage.removeItem('doc_print_title'); }
      setTimeout(() => window.print(), 1000);
    }
  }, []);

  if (!html) return <div style={{ padding: 40, color: '#888', fontFamily: 'sans-serif' }}>로딩 중...</div>;

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
