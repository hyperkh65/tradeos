'use client';
import { useEffect, useState } from 'react';

export default function QuotePrintPage() {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('quote_print_html');
    if (raw) {
      setHtml(raw);
      sessionStorage.removeItem('quote_print_html');
      setTimeout(() => window.print(), 800);
    }
  }, []);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ margin: 0, padding: 0, background: 'white' }}
    />
  );
}
