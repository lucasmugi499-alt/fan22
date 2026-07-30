import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { MarketingMobileMenu } from '@/components/marketing/MarketingMobileMenu';

const FOOTER_LINKS = [
  {
    title: 'Explore',
    links: [
      ['Leagues', '/leagues'],
      ['Matches', '/matches'],
      ['Athletes', '/athletes'],
      ['How it works', '/how-it-works'],
    ],
  },
  {
    title: 'GoalPlace256',
    links: [
      ['Verification', '/verification'],
      ['Uganda pilot', '/pilot'],
      ['Sponsors', '/sponsors'],
    ],
  },
  {
    title: 'Account',
    links: [
      ['Sign in', '/login'],
      ['Create fan account', '/register'],
      ['League application', '/pilot'],
      ['Team Admin invitation', '/login'],
    ],
  },
] as const;

/**
 * Public-page chrome using the same broadcast token system as the product.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-sm bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="glass fixed inset-x-0 top-0 z-30 border-b border-border">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between px-[var(--gutter)]">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="GoalPlace256 home">
            <span className="grid h-8 w-8 place-items-center rounded-sm bg-brand text-sm font-black text-on-brand shadow-[var(--glow-brand)] transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
              G
            </span>
            <span className="font-display text-[15px] font-semibold text-text-strong">
              GoalPlace256
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Primary navigation">
            <Link
              href="/"
              className="hidden rounded-sm px-3 py-2 font-medium text-text-strong transition hover:bg-white/5 lg:block"
            >
              Home
            </Link>
            <Link
              href="/leagues"
              className="hidden rounded-sm px-3 py-2 text-muted transition hover:bg-white/5 hover:text-text-strong lg:block"
            >
              Leagues
            </Link>
            <Link
              href="/matches"
              className="hidden rounded-sm px-3 py-2 text-muted transition hover:bg-white/5 hover:text-text-strong lg:block"
            >
              Matches
            </Link>
            <Link
              href="/athletes"
              className="hidden rounded-sm px-3 py-2 text-muted transition hover:bg-white/5 hover:text-text-strong lg:block"
            >
              Athletes
            </Link>
            <Link
              href="/how-it-works"
              className="hidden rounded-sm px-3 py-2 text-muted transition hover:bg-white/5 hover:text-text-strong xl:block"
            >
              How it works
            </Link>
            <Link
              href="/sponsors"
              className="hidden rounded-sm px-3 py-2 text-muted transition hover:bg-white/5 hover:text-text-strong xl:block"
            >
              Sponsors
            </Link>
            <Link
              href="/login"
              className="hidden rounded-sm px-3 py-2 font-medium text-muted transition hover:text-text-strong lg:block"
            >
              Sign in
            </Link>
            <Link
              href="/leagues"
              className="group ml-1 hidden h-10 items-center gap-2 rounded-sm bg-brand px-4 font-bold text-on-brand transition hover:bg-brand-hover active:translate-y-px lg:inline-flex"
            >
              Explore leagues
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                weight="bold"
              />
            </Link>
            <MarketingMobileMenu />
          </nav>
        </div>
      </header>

      <main id="main-content" className="px-[var(--gutter)]">
        {children}
      </main>

      <footer className="border-t border-border bg-surface-1/60">
        <div className="mx-auto max-w-7xl px-[var(--gutter)] py-12 sm:py-16">
          <div className="grid gap-12 sm:grid-cols-[1.4fr_2fr]">
            <div>
              <Link href="/" className="inline-flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-sm bg-brand text-sm font-black text-on-brand">
                  G
                </span>
                <span className="font-display text-base font-semibold text-text-strong">
                  GoalPlace256
                </span>
              </Link>
              <p className="mt-5 max-w-sm text-sm leading-6 text-muted">
                The verified operating platform for grassroots sport. Starting in Uganda. Built for
                Africa.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {FOOTER_LINKS.map((group) => (
                <div key={group.title}>
                  <h2 className="text-xs font-semibold text-text-strong">{group.title}</h2>
                  <ul className="mt-4 space-y-3">
                    {group.links.map(([label, href]) => (
                      <li key={label}>
                        <Link
                          href={href}
                          className="text-sm text-muted transition hover:text-text-strong"
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 border-t border-border pt-6">
            <p className="max-w-3xl text-xs leading-5 text-subtle">
              This demonstration build contains seeded fictional data for product presentation.
              Figures shown are not live traction or official competition records.
            </p>
          </div>
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
    <section className="mx-auto max-w-7xl pb-14 pt-32 md:pb-20 md:pt-40">
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-muted">
        {eyebrow}
      </span>
      <h1 className="mt-5 max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.05] text-text-strong md:text-6xl">
        {title}
      </h1>
      {children ? (
        <div className="mt-5 max-w-xl text-pretty text-base leading-7 text-muted md:text-lg">
          {children}
        </div>
      ) : null}
    </section>
  );
}
