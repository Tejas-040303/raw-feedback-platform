'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL, type SessionUser } from '@/app/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Top bar. Asks the API who is logged in on every navigation, so it updates
 * right after logging in or out. (undefined = still asking, null = logged out.)
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [resent, setResent] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(async (res) => (res.ok ? ((await res.json()).user as SessionUser) : null))
      .catch(() => null)
      .then((u) => { if (!cancelled) setUser(u); });
    return () => { cancelled = true; };
  }, [pathname]);

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    router.push('/');
    router.refresh();
  }

  async function resend() {
    const res = await fetch(`${API_URL}/auth/resend-verification`, { method: 'POST', credentials: 'include' }).catch(() => null);
    setResent(res?.status === 429 ? 'Already sent several emails. Check your inbox and spam folder.' : 'Sent. Check your inbox.');
  }

  const onTokenPage = pathname === '/verify-email' || pathname === '/reset-password';

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3">
          <Link href="/" className="font-display text-lg font-bold tracking-tight">
            raw<span className="text-primary">/</span>feedback
          </Link>
          <form action="/" className="ml-2 hidden flex-1 sm:block" role="search">
            <label htmlFor="site-search" className="sr-only">Search reviews</label>
            <Input id="site-search" name="q" type="search" placeholder="Search places, companies, services…" className="max-w-md bg-background" />
          </form>
          <nav className="ml-auto flex items-center gap-2" aria-label="Account">
            <Link href="/write" className={buttonVariants({ size: 'sm' })}>Write a review</Link>
            {user === undefined ? null : user ? (
              <>
                <span className="hidden text-sm text-muted-foreground md:inline">@{user.username}</span>
                <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
              </>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Log in</Link>
                <Link href="/signup" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden sm:inline-flex' })}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {user && !user.email_verified && !onTokenPage && (
        <div className="border-b bg-warning-soft px-4 py-2 text-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
            <span><strong>Confirm your email</strong> to post and upvote. We sent a link to {user.email}.</span>
            {resent ? <span role="status" className="text-muted-foreground">{resent}</span> : (
              <Button variant="link" size="sm" className="h-auto px-0" onClick={resend}>Resend email</Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
