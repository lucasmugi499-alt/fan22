'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Basketball,
  CalendarBlank,
  House,
  Info,
  List,
  SignIn,
  SoccerBall,
  Trophy,
  Users,
  X,
} from '@phosphor-icons/react';

const LINKS = [
  { label: 'Home', href: '/', icon: House },
  { label: 'Leagues', href: '/leagues', icon: SoccerBall },
  { label: 'Matches', href: '/matches', icon: CalendarBlank },
  { label: 'Athletes', href: '/athletes', icon: Users },
  { label: 'Fantasy', href: '/fantasy', icon: Trophy },
  { label: 'How it works', href: '/how-it-works', icon: Info },
  { label: 'Sponsors', href: '/sponsors', icon: Basketball },
] as const;

export function MarketingMobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    panel?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="marketing-mobile-navigation"
        onClick={() => setOpen((value) => !value)}
        className="grid h-10 w-10 place-items-center rounded-sm border border-border bg-surface-1 text-text-strong transition hover:bg-surface-2"
      >
        {open ? <X className="h-5 w-5" weight="bold" /> : <List className="h-5 w-5" weight="bold" />}
      </button>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-[4.25rem] z-40 h-[calc(100dvh-4.25rem)] bg-surface-0/95 backdrop-blur-xl">
          <nav
            ref={panelRef}
            id="marketing-mobile-navigation"
            aria-label="Mobile navigation"
            className="mx-auto flex h-full max-w-7xl flex-col px-[var(--gutter)] py-5"
          >
            <div className="grid gap-1">
              {LINKS.map(({ label, href, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 border-b border-border px-2 text-base font-semibold transition ${
                      active ? 'text-brand' : 'text-text-strong hover:text-brand'
                    }`}
                  >
                    <Icon className="h-5 w-5" weight={active ? 'fill' : 'regular'} />
                    {label}
                  </Link>
                );
              })}
            </div>

            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-auto mb-[calc(var(--safe-bottom)+1.25rem)] inline-flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-5 text-sm font-bold text-on-brand transition hover:bg-brand-hover"
            >
              <SignIn className="h-4 w-4" weight="bold" />
              Sign in
            </Link>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
