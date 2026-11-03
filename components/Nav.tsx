'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { buttonClass } from './ui';

/** The top bar. On a phone the links sit behind a Menu button; the links are always in the page, so they are never missing from the HTML. */
export function Nav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const link = (href: string) =>
    `flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold hover:bg-subtle md:min-h-9 ${pathname === href ? 'bg-subtle text-brand' : 'text-ink'}`;

  async function signOut() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-line-strong bg-canvas">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Ujuzi home" className="mr-2 py-2"><Logo showTagline /></Link>
        {user && <span className="hidden rounded-xs border border-line-strong bg-subtle px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-secondary sm:inline">{user.role === 'staff' ? 'Centre staff' : 'Graduate'}</span>}

        <div className="ml-auto flex items-center gap-2 md:order-3">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-sm border border-line-strong bg-surface px-3 text-sm font-bold md:hidden"
            aria-expanded={open}
            aria-controls="site-links"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>

        <nav aria-label="Main" id="site-links" className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-1 pb-3 md:order-2 md:ml-4 md:flex md:w-auto md:flex-row md:items-center md:gap-1 md:pb-0`}>
          {user?.role === 'graduate' && (
            <>
              <Link href="/" className={link('/')}>Courses</Link>
              <Link href="/my-courses" className={link('/my-courses')}>My courses</Link>
              <Link href="/my-applications" className={link('/my-applications')}>My applications</Link>
            </>
          )}
          {user?.role === 'staff' && (
            <>
              <Link href="/" className={link('/')}>Courses</Link>
              <Link href="/staff" className={link('/staff')}>Centre staff</Link>
            </>
          )}
          <Link href="/docs" className={link('/docs')}>API docs</Link>
          <span className="mt-1 flex flex-col gap-2 md:ml-2 md:mt-0 md:flex-row md:items-center">
            {loading ? null : user ? (
              <>
                <span className="px-3 text-sm text-ink-secondary md:px-0">{user.firstName} {user.lastName}</span>
                <button type="button" className={buttonClass({ tone: 'plain', size: 'sm' })} onClick={signOut}>Log out</button>
              </>
            ) : (
              <>
                <Link href="/login" className={buttonClass({ tone: 'plain', size: 'sm' })}>Log in</Link>
                <Link href="/register" className={buttonClass({ tone: 'primary', size: 'sm' })}>Join free</Link>
              </>
            )}
          </span>
        </nav>
      </div>
    </header>
  );
}
