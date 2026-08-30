import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { getBrandConfig } from '@/lib/brand';
import { PwaManager } from '@/components/pwa/pwa-manager';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d4ed8',
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = getBrandConfig();
  return {
    title: { default: appName, template: `%s | ${appName}` },
    description: '무역회사 전용 통합 그룹웨어',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: appName,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full`}>
      <body className="h-full bg-background font-sans antialiased">
        {children}
        <PwaManager />
      </body>
    </html>
  );
}
