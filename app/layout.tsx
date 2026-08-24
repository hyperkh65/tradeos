import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { getBrandConfig } from '@/lib/brand';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = getBrandConfig();
  return {
    title: { default: appName, template: `%s | ${appName}` },
    description: '무역회사 전용 통합 그룹웨어',
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full`}>
      <body className="h-full bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
