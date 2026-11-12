import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/Toast';
import { baloo, balooExt, mono } from '@/fonts';
import './globals.css';

/** Public address of the site. Set NEXT_PUBLIC_SITE_URL on Vercel; the default is the planned domain. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://letsplaytambola.com';
const DESCRIPTION =
  'Play Tambola (Housie) online with family and friends. Host a game, share one link on WhatsApp, and everyone plays by typing their name. Free, no sign-up, no download.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Letsplaytambola — Housie night, sorted.',
    template: '%s — Letsplaytambola',
  },
  description: DESCRIPTION,
  applicationName: 'Letsplaytambola',
  keywords: ['Tambola', 'Housie', 'Tambola online', 'Housie online', 'kitty party games', 'Tambola with family', 'Indian bingo'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Letsplaytambola',
    title: 'Letsplaytambola — Housie night, sorted.',
    description: DESCRIPTION,
    url: '/',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Letsplaytambola — Housie night, sorted.',
    description: DESCRIPTION,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1b0f34',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${baloo.variable} ${balooExt.variable} ${mono.variable}`} data-scroll-behavior="smooth">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
