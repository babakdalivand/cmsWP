import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';

export const metadata: Metadata = {
  title: {
    default: 'پرشین ایتئیست‌ها',
    template: '%s | پرشین ایتئیست‌ها',
  },
  description: 'ویدیوهای یوتیوب کانال پرشین ایتئیست‌ها',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://persianatheists.com'),
  openGraph: {
    type:   'website',
    locale: 'fa_IR',
    siteName: 'پرشین ایتئیست‌ها',
  },
};

export const viewport: Viewport = {
  themeColor: '#141414',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body className="min-h-screen bg-[#141414] text-neutral-200 antialiased">
        <Header />
        <main className="min-h-[calc(100vh-60px)] pb-16 md:pb-0">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
