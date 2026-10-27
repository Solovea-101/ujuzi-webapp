'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export function Nav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const link = 'rounded-md px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100';

  return (
    <header className="border-b border-brand-100 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3 sm:px-6" aria-label="Main">
        <Link href="/" className="mr-3 text-xl font-bold text-brand-700">Ujuzi</Link>
        {user?.role === 'graduate' && (
          <>
            <Link href="/my-courses" className={link}>My courses</Link>
            <Link href="/my-applications" className={link}>My applications</Link>
          </>
        )}
        {user?.role === 'staff' && <Link href="/staff" className={link}>Centre staff</Link>}
        <Link href="/docs" className={link}>API docs</Link>
        <span className="ml-auto flex items-center gap-1">
          {loading ? null : user ? (
            <>
              <span className="mr-2 hidden text-sm text-ink/70 sm:inline">{user.firstName} {user.lastName}</span>
              <button
                className={link}
                onClick={async () => { await logout(); router.push('/'); router.refresh(); }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>Log in</Link>
              <Link href="/register" className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Sign up</Link>
            </>
          )}
        </span>
      </nav>
    </header>
  );
}
