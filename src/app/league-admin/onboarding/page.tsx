import Link from 'next/link';
import {
  Buildings,
  CalendarCheck,
  CheckCircle,
  ClipboardText,
  MapPin,
  ShieldCheck,
  Trophy,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr';
import { Card } from '@/components/ui/Card';

const steps = [
  { label: 'League profile', detail: 'Name, region, contacts and public description.', href: '/league-admin', icon: Buildings },
  { label: 'Season setup', detail: 'Season dates, competition format and active sport.', href: '/league-admin/fixtures', icon: CalendarCheck },
  { label: 'Sport rules', detail: 'Scoring rules, table points and tie-breakers.', href: '/league-admin/fixtures', icon: Trophy },
  { label: 'Teams', detail: 'Create team profiles and invite Team Admins.', href: '/league-admin/teams', icon: UsersThree },
  { label: 'Venues', detail: 'Attach common match locations and field notes.', href: '/league-admin/fixtures', icon: MapPin },
  { label: 'Verification policy', detail: 'Result submission, opponent confirmation and disputes.', href: '/league-admin/verification', icon: ShieldCheck },
  { label: 'Safeguarding contact', detail: 'Record the operational contact for athlete protection.', href: '/settings', icon: ClipboardText },
  { label: 'Launch review', detail: 'Platform Admin approval before public pilot launch.', href: '/admin/approvals', icon: CheckCircle },
];

export default function LeagueOnboardingPage() {
  return (
    <main className="space-y-5">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand shadow-[var(--glow-brand)]">
          <ShieldCheck className="h-6 w-6" weight="fill" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-strong">League onboarding</h1>
          <p className="text-sm text-muted">Complete the operational checklist before launch review.</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {steps.map(({ label, detail, href, icon: Icon }, index) => (
          <Link key={label} href={href} className="block">
            <Card className="h-full p-4 transition hover:border-brand/45 hover:bg-surface-2">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-3 text-brand">
                  <Icon className="h-5 w-5" weight="duotone" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Step {index + 1}</p>
                  <h2 className="mt-1 text-sm font-semibold text-text-strong">{label}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
