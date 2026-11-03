import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { Providers } from '@/components/Providers';
import './globals.css';

// next/font downloads these once at build time and serves them from this site: nothing is requested from Google
// by a visitor's browser.
const display = Space_Grotesk({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-space-grotesk', display: 'swap' });
const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plus-jakarta', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Ujuzi: skills training',
  description: 'Short courses, certificates and live Kazi Connect jobs for young people in Kenya.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#101412' },
  ],
};

// Runs before the first paint, so a dark-theme visitor never sees a flash of light. A saved choice wins over the device setting.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('ujuzi.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-canvas text-ink antialiased">
        <a href="#main" className="skip-link">Skip to content</a>
        <Providers>
          <Nav />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
