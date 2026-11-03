'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/clientApi';
import { Emblem } from './Logo';

export function Footer() {
  // The log-in links are only useful to someone who is not signed in. Read from this browser's storage after
  // the page loads, so the first render (and the server's HTML) is the same for everyone.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(getToken() !== null), []);

  return (
    <footer className="mt-12 border-t-2 border-line-strong bg-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 text-ink"><span className="text-brand"><Emblem size={22} /></span><strong className="font-display uppercase">Ujuzi</strong> Skills training for Kenya</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {!signedIn && <li><Link className="font-semibold text-ink underline" href="/login">Log in</Link></li>}
          {!signedIn && <li><Link className="font-semibold text-ink underline" href="/register">Create an account</Link></li>}
          <li><Link className="font-semibold text-ink underline" href="/docs">Partner and developer API</Link></li>
        </ul>
      </div>
    </footer>
  );
}
