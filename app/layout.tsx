import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ujuzi: skills training',
  description: 'Short courses, certificates and live Kazi Connect jobs for young people in Kenya.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand text-ink antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
