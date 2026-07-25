import Link from 'next/link';

/**
 * Chrome for public/marketing pages. Expressive but the same dark token system as the app.
 * No bottom nav; a slim glass header and a footer.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-[var(--gutter)] py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-brand text-on-brand text-sm font-bold shadow-[var(--glow-brand)]">G</span>
            <span className="font-display text-[15px] font-semibold text-text-strong">GoalPlace256</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/how-it-works" className="hidden rounded-[var(--radius-md)] px-3 py-2 text-muted hover:text-text-strong sm:block">How it works</Link>
            <Link href="/verification" className="hidden rounded-[var(--radius-md)] px-3 py-2 text-muted hover:text-text-strong sm:block">Verification</Link>
            <Link href="/sponsors" className="hidden rounded-[var(--radius-md)] px-3 py-2 text-muted hover:text-text-strong sm:block">Sponsors</Link>
            <Link href="/login" className="rounded-[var(--radius-md)] border border-border-strong bg-surface-2 px-4 py-2 font-medium text-text-strong hover:bg-surface-3">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-[var(--gutter)]">{children}</main>

      <footer className="mt-16 border-t border-border">
        <div className="mx-auto max-w-5xl px-[var(--gutter)] py-8">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <Link href="/how-it-works" className="hover:text-text-strong">How it works</Link>
            <Link href="/verification" className="hover:text-text-strong">Verification</Link>
            <Link href="/sponsors" className="hover:text-text-strong">Sponsors</Link>
            <Link href="/pilot" className="hover:text-text-strong">Uganda pilot</Link>
          </div>
          <p className="mt-4 text-xs text-subtle">
            Demonstration build. Figures shown in the app are seeded demonstration data, not live traction.
          </p>
        </div>
      </footer>
    </div>
  );
}

export function MarketingHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="py-14 md:py-20">
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-muted">
        {eyebrow}
      </span>
      <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-text-strong md:text-6xl">
        {title}
      </h1>
      {children ? <div className="mt-5 max-w-xl text-base text-muted md:text-lg">{children}</div> : null}
    </section>
  );
}
