import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Basketball,
  Broadcast,
  CalendarCheck,
  CaretRight,
  ChartLineUp,
  CheckCircle,
  ClockCounterClockwise,
  Eye,
  FlagCheckered,
  Handshake,
  Heart,
  Lightning,
  MapPin,
  Medal,
  PersonSimpleRun,
  SealCheck,
  ShieldCheck,
  SoccerBall,
  Target,
  TrendUp,
  Trophy,
} from '@phosphor-icons/react/dist/ssr';

import { MarketingShell } from '@/components/marketing/MarketingShell';

const DISCOVERY_FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Fixtures that are easy to find',
    description: 'Upcoming matches, venues, kickoff times, and complete league schedules.',
  },
  {
    icon: ShieldCheck,
    title: 'Results you can trust',
    description: 'Scores appear as official only after the confirmation process is complete.',
  },
  {
    icon: ChartLineUp,
    title: 'Standings that stay current',
    description: 'Follow tables, team form, rankings, and every turn in the season.',
  },
  {
    icon: PersonSimpleRun,
    title: 'Athletes worth knowing',
    description: 'Discover talent through verified performances, achievements, and stories.',
  },
];

const LEAGUES = [
  {
    id: 'league_football_kampala',
    name: 'Kampala Metro Community Football League',
    sport: 'Football',
    location: 'Kampala',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-emerald-950 via-emerald-900 to-surface-1',
    icon: SoccerBall,
  },
  {
    id: 'league_football_eastern',
    name: 'Eastern Uganda Regional Development League',
    sport: 'Football',
    location: 'Mbale',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-green-950 via-teal-950 to-surface-1',
    icon: SoccerBall,
  },
  {
    id: 'league_basketball_kampala',
    name: 'Kampala Metropolitan Basketball League',
    sport: 'Basketball',
    location: 'Kampala',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-orange-950 via-amber-950 to-surface-1',
    icon: Basketball,
  },
  {
    id: 'league_basketball_north',
    name: 'Northern Uganda Community Basketball League',
    sport: 'Basketball',
    location: 'Gulu',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-red-950 via-orange-950 to-surface-1',
    icon: Basketball,
  },
  {
    id: 'league_rugby_kampala',
    name: 'Kampala Community Rugby Championship',
    sport: 'Rugby',
    location: 'Kampala',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-blue-950 via-cyan-950 to-surface-1',
    icon: FlagCheckered,
  },
  {
    id: 'league_rugby_eastern',
    name: 'Nile and Eastern Rugby Development League',
    sport: 'Rugby',
    location: 'Jinja',
    season: '2026 season',
    teams: 10,
    matches: 45,
    accent: 'from-indigo-950 via-sky-950 to-surface-1',
    icon: FlagCheckered,
  },
];

const ATHLETES = [
  {
    id: 'ath_football_01_06_07',
    name: 'Daniel Aciro',
    team: 'Luzira Athletic',
    league: 'Kampala Metro Community Football League',
    position: 'Defensive midfielder',
    stat: '8 apps',
    note: 'Training boots and strength equipment',
    color: 'bg-emerald-400',
    initials: 'AN',
  },
  {
    id: 'ath_basketball_04_03_11',
    name: 'Peter Namanya',
    team: 'Kitgum Warriors',
    league: 'Northern Uganda Community Basketball League',
    position: 'Guard',
    stat: '32 pts',
    note: 'Registration fees',
    color: 'bg-orange-400',
    initials: 'BO',
  },
  {
    id: 'ath_rugby_05_07_05',
    name: 'Trevor Kalema',
    team: 'Lubowa Harriers',
    league: 'Kampala Community Rugby Championship',
    position: 'Lock',
    stat: '52 tackles',
    note: 'Recovery support',
    color: 'bg-sky-400',
    initials: 'SN',
  },
];

const FAN_BENEFITS = [
  ['Follow your league', 'Fixtures, standings, announcements, and the teams your community cares about.'],
  ['Discover rising talent', 'Find athletes before the rest of the world notices them.'],
  ['Support real needs', 'Help with transport, equipment, registration, recovery, and development.'],
  ['See your impact', 'Track how support connects to athletes, teams, and community sport.'],
  ['Get trusted updates', 'Receive official results, fixture changes, and athlete stories.'],
  ['Celebrate local sport', 'Share achievements and help grassroots competitions grow.'],
];

const SUPPORT_NEEDS = [
  'Boots and equipment',
  'Transport',
  'Registration fees',
  'Training costs',
  'Meals and nutrition',
  'Recovery support',
  'Team development',
  'Youth league development',
];

const SPORTS = [
  {
    icon: SoccerBall,
    name: 'Football',
    description: 'Fixtures, tables, goals, assists, clean sheets, and verified player records.',
    color: 'text-football',
  },
  {
    icon: Basketball,
    name: 'Basketball',
    description: 'Schedules, points, rebounds, assists, standings, and athlete development.',
    color: 'text-basketball',
  },
  {
    icon: FlagCheckered,
    name: 'Rugby',
    description: 'Official results, tries, conversions, team performance, and player pathways.',
    color: 'text-rugby',
  },
];

function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow?: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? (
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand">
          <span className="h-px w-7 bg-brand" />
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-balance font-display text-3xl font-semibold leading-[1.05] text-text-strong sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg">{copy}</p>
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-text-strong transition-colors duration-200 hover:text-brand"
    >
      {children}
      <ArrowRight
        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
        weight="bold"
      />
    </Link>
  );
}

export function Landing() {
  return (
    <MarketingShell>
      <section
        id="home"
        className="relative isolate -mx-[var(--gutter)] flex min-h-[calc(100dvh-4.25rem)] items-end overflow-hidden border-b border-border px-[var(--gutter)] pb-10 pt-24 sm:pb-14 lg:min-h-[46rem] lg:pb-16 lg:pt-32"
      >
        <Image
          src="/images/goalplace256-hero.png"
          alt="A floodlit grassroots sports ground alive with players and supporters at night"
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-30 object-cover object-center"
        />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(5,7,10,0.96)_0%,rgba(5,7,10,0.72)_50%,rgba(5,7,10,0.28)_100%)]" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(0deg,rgba(5,7,10,1)_0%,rgba(5,7,10,0.14)_58%,rgba(5,7,10,0.48)_100%)]" />
        <div className="landing-field-lines absolute inset-0 -z-10 opacity-30" />

        <div className="mx-auto grid w-full max-w-7xl items-end gap-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="max-w-4xl">
            <div className="landing-rise landing-delay-1 inline-flex items-center gap-2 rounded-sm border border-white/15 bg-black/35 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md">
              <Broadcast className="h-4 w-4 text-brand" weight="fill" />
              Grassroots sport. One trusted home.
            </div>
            <h1 className="landing-rise landing-delay-2 mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[0.96] text-white sm:text-6xl lg:text-8xl">
              Follow the leagues shaping Africa&apos;s sporting future, starting in Uganda.
            </h1>
            <p className="landing-rise landing-delay-3 mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-200 sm:text-lg">
              Fixtures, verified results, rising athletes, and the teams your community cares
              about. Football, basketball, and rugby now have one trusted place to be seen.
            </p>
            <div className="landing-rise landing-delay-4 mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/leagues"
                className="group inline-flex h-12 items-center gap-3 rounded-sm bg-brand px-5 text-sm font-bold text-on-brand shadow-[var(--glow-brand)] transition duration-200 hover:bg-brand-hover active:translate-y-px"
              >
                Explore leagues
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  weight="bold"
                />
              </Link>
              <Link
                href="/athletes"
                className="inline-flex h-12 items-center gap-2 rounded-sm border border-white/20 bg-black/30 px-5 text-sm font-semibold text-white backdrop-blur-md transition duration-200 hover:border-white/40 hover:bg-white/10 active:translate-y-px"
              >
                <PersonSimpleRun className="h-4 w-4" weight="bold" />
                Discover athletes
              </Link>
            </div>
            <div className="landing-rise landing-delay-5 mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-300">
              {['Verified competitions', 'Visible athletes', 'Stronger communities'].map(
                (item) => (
                  <span key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-brand" weight="fill" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="landing-rise landing-delay-4 hidden lg:block">
            <div className="landing-score-card overflow-hidden rounded-lg border border-white/15 bg-black/55 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs">
                <span className="flex items-center gap-2 font-semibold text-white">
                  <span className="animate-live-ring h-2 w-2 rounded-full bg-live" />
              Live in Kampala
                </span>
                <span className="font-mono text-slate-400">68:24</span>
              </div>
              <div className="px-5 py-5">
              <p className="text-xs text-slate-400">Kampala Metro Community Football League</p>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div>
                    <span className="grid h-11 w-11 place-items-center rounded-md bg-emerald-400 text-sm font-black text-emerald-950">
                      LA
                    </span>
                    <p className="mt-2 text-sm font-semibold text-white">Luzira Athletic</p>
                  </div>
                  <div className="font-mono text-3xl font-bold text-white">2:4</div>
                  <div className="text-right">
                    <span className="ml-auto grid h-11 w-11 place-items-center rounded-md bg-amber-400 text-sm font-black text-amber-950">
                      NE
                    </span>
                    <p className="mt-2 text-sm font-semibold text-white">Ntinda Eagles</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-white/[0.04] px-4 py-3 text-xs">
                <span className="text-slate-400">Luzira Sports Park</span>
                <span className="flex items-center gap-1.5 font-semibold text-brand">
                  <Eye className="h-3.5 w-3.5" weight="bold" />
                  53 following
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="landing-ticker -mx-[var(--gutter)] overflow-hidden border-b border-border bg-brand text-on-brand">
        <div className="landing-ticker-track flex w-max items-center py-3 text-xs font-bold">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center">
              {[
                'Official: Kisenyi United 3 - 3 Kyambogo Rangers',
                'Kampala Hoops: next round ready',
                '45 fixtures remain in each league',
                'Daniel Aciro profile verified',
              ].map((item) => (
                <span key={`${copy}-${item}`} className="flex items-center whitespace-nowrap px-6">
                  <Lightning className="mr-2 h-4 w-4" weight="fill" />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-7xl py-24 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <SectionHeading
            title="Your local game deserves a bigger stage."
            copy="Grassroots sport is full of talent, competition, and unforgettable stories. GoalPlace256 gives fans one place to track the action as it happens."
          />
          <p className="max-w-xl text-pretty text-sm leading-6 text-subtle lg:ml-auto">
            No more searching through scattered messages, paper schedules, and social posts. Every
            competition becomes easier to follow, trust, and remember.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {DISCOVERY_FEATURES.map(({ icon: Icon, title, description }, index) => (
            <article
              key={title}
              className="group relative min-h-52 bg-surface-1 p-6 transition-colors duration-300 hover:bg-surface-2 sm:p-8"
            >
              <span className="font-mono text-xs text-subtle">0{index + 1}</span>
              <Icon
                className="absolute right-6 top-6 h-7 w-7 text-brand transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110"
                weight="duotone"
              />
              <h3 className="mt-12 max-w-xs text-xl font-semibold text-text-strong">{title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="leagues" className="-mx-[var(--gutter)] border-y border-border bg-surface-1/60">
        <div className="mx-auto max-w-7xl px-[var(--gutter)] py-24 sm:py-28">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading
              eyebrow="Around Uganda"
              title="Explore active leagues"
              copy="Follow community competitions and discover the teams, athletes, fixtures, and stories behind every season."
            />
            <TextLink href="/leagues">View all leagues</TextLink>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {LEAGUES.map(({ id, name, sport, location, season, teams, matches, accent, icon: Icon }) => (
              <article
                key={name}
                className={`group relative flex min-h-96 flex-col overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br ${accent} p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20`}
              >
                <div className="landing-card-grid absolute inset-0 opacity-25" />
                <div className="relative flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-md border border-white/15 bg-black/20 text-white">
                    <Icon className="h-6 w-6" weight="duotone" />
                  </span>
                  <span className="flex items-center gap-1.5 rounded-sm bg-black/25 px-2.5 py-1.5 text-xs font-semibold text-verified">
                    <SealCheck className="h-3.5 w-3.5" weight="fill" />
                    Verified
                  </span>
                </div>
                <div className="relative mt-auto pt-16">
                  <p className="text-xs font-medium text-slate-300">
                    {sport} / {season}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{name}</h3>
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-300">
                    <MapPin className="h-4 w-4" weight="fill" />
                    {location}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                    <div>
                      <p className="font-mono text-lg font-bold text-white">{teams}</p>
                      <p className="text-xs text-slate-400">teams</p>
                    </div>
                    <div>
                      <p className="font-mono text-lg font-bold text-white">{matches}</p>
                      <p className="text-xs text-slate-400">upcoming</p>
                    </div>
                  </div>
                  <Link
                    href={`/leagues/${id}`}
                    className="mt-5 inline-flex h-11 w-full items-center justify-between rounded-sm bg-white px-4 text-sm font-bold text-surface-0 transition hover:bg-brand active:translate-y-px"
                  >
                    View league
                    <CaretRight className="h-4 w-4" weight="bold" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="matches" className="mx-auto max-w-7xl py-24 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading
              eyebrow="The next whistle"
              title="Never miss the next match"
              copy="See what is coming up, follow live activity, and check official results after both teams confirm them."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {['Live now', 'Upcoming', 'Recently official', 'This week'].map((item, index) => (
                <span
                  key={item}
                  className={`rounded-sm border px-3 py-2 text-xs font-semibold ${
                    index === 0
                      ? 'border-live/30 bg-[var(--state-live-bg)] text-live'
                      : 'border-border bg-surface-1 text-muted'
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-8">
              <TextLink href="/matches">View all matches</TextLink>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-text-strong">
                <span className="animate-live-pulse h-2 w-2 rounded-full bg-live" />
                Live now
              </span>
                <span className="font-mono text-xs text-subtle">KMCFL / ROUND 09</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-8 sm:px-8">
              <div>
                <span className="grid h-12 w-12 place-items-center rounded-md bg-emerald-400 font-mono text-sm font-bold text-emerald-950">
                  LA
                </span>
                <p className="mt-3 text-sm font-semibold text-text-strong sm:text-base">Luzira Athletic</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-3xl font-bold text-text-strong sm:text-4xl">2 - 4</p>
                <p className="mt-2 font-mono text-xs text-live">68:24</p>
              </div>
              <div className="text-right">
                <span className="ml-auto grid h-12 w-12 place-items-center rounded-md bg-amber-400 font-mono text-sm font-bold text-amber-950">
                  NE
                </span>
                <p className="mt-3 text-sm font-semibold text-text-strong sm:text-base">Ntinda Eagles</p>
              </div>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              <div className="bg-surface-2 px-5 py-4">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <MapPin className="h-4 w-4 text-brand" weight="fill" />
                  Luzira Sports Park
                </p>
              </div>
              <div className="bg-surface-2 px-5 py-4 sm:text-right">
                <p className="text-xs font-semibold text-pending">Confirmation opens at full time</p>
              </div>
            </div>
            <div className="space-y-px bg-border">
              {[
                ['Sat 11 Apr / 13:00', 'Kyambogo Rangers', 'Kisenyi United', 'Upcoming'],
                ['Sat 07 Feb / FT', 'Makindye City', 'Mengo City', 'Official 0 - 1'],
              ].map(([time, home, away, state]) => (
                <Link
                  href="/matches"
                  key={`${home}-${away}`}
                  className="group grid gap-3 bg-surface-1 px-5 py-4 transition hover:bg-surface-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center"
                >
                  <span className="font-mono text-xs text-subtle">{time}</span>
                  <span className="text-sm font-semibold text-text-strong">
                    {home} <span className="px-1 text-subtle">vs</span> {away}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {state}
                    <CaretRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="athletes" className="-mx-[var(--gutter)] overflow-hidden border-y border-border bg-[#080d12]">
        <div className="mx-auto max-w-7xl px-[var(--gutter)] py-24 sm:py-28">
          <SectionHeading
            eyebrow="Hidden talent deserves visibility"
            title="Meet the athletes building the future of sport."
            copy="Discover local athletes through profiles built around verified competition records, achievements, stories, and development goals."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {ATHLETES.map((athlete, index) => (
              <article
                key={athlete.name}
                className="group overflow-hidden rounded-lg border border-border bg-surface-1 transition duration-300 hover:-translate-y-1 hover:border-border-strong"
              >
                <div className="relative flex aspect-[5/3] items-end overflow-hidden bg-surface-2 p-5">
                  <Image
                    src="/images/goalplace256-hero.png"
                    alt={`${athlete.name}, a featured grassroots athlete`}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                    style={{ objectPosition: `${30 + index * 22}% center` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                  <span
                    className={`relative grid h-14 w-14 place-items-center rounded-md ${athlete.color} font-mono text-sm font-black text-surface-0 shadow-xl`}
                  >
                    {athlete.initials}
                  </span>
                  <span className="relative ml-auto flex items-center gap-1 rounded-sm bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-verified backdrop-blur-md">
                    <SealCheck className="h-3.5 w-3.5" weight="fill" />
                    Verified
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-text-strong">{athlete.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {athlete.position} / {athlete.team}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-brand">{athlete.stat}</span>
                  </div>
                  <p className="mt-4 text-xs text-subtle">{athlete.league}</p>
                  <div className="mt-5 flex items-start gap-3 border-t border-border pt-4">
                    <Heart className="mt-0.5 h-4 w-4 shrink-0 text-brand-2" weight="fill" />
                    <p className="text-sm leading-5 text-muted">{athlete.note}</p>
                  </div>
                  <div className="mt-5">
                    <Link
                      href={`/athletes/${athlete.id}`}
                      className="inline-flex h-11 w-full items-center justify-center rounded-sm bg-brand text-sm font-bold text-on-brand transition hover:bg-brand-hover active:translate-y-px"
                    >
                      View profile
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8">
            <TextLink href="/athletes">Discover more athletes</TextLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl py-24 sm:py-28">
        <SectionHeading
          title="Everything local sports fans need, in one place."
          copy="Follow what matters, discover who is next, and see the difference your attention can make."
        />
        <div className="mt-14 grid border-y border-border md:grid-cols-2 lg:grid-cols-3">
          {FAN_BENEFITS.map(([title, description], index) => (
            <article
              key={title}
              className="relative border-b border-border py-8 md:px-6 lg:border-r lg:px-8 lg:[&:nth-child(3n)]:border-r-0"
            >
              <span className="font-mono text-xs text-brand">0{index + 1}</span>
              <h3 className="mt-8 text-lg font-semibold text-text-strong">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="-mx-[var(--gutter)] border-y border-border bg-surface-1/65">
        <div className="mx-auto grid max-w-7xl gap-16 px-[var(--gutter)] py-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:py-28">
          <div>
            <SectionHeading
              eyebrow="Support that can change a career"
              title="Help talent move forward."
              copy="A small barrier can become a major obstacle. GoalPlace256 helps fans support clearly identified athlete and team needs without influencing results or rankings."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {SUPPORT_NEEDS.map((need) => (
                <span
                  key={need}
                  className="rounded-sm border border-border bg-surface-0 px-3 py-2 text-xs font-medium text-muted"
                >
                  {need}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <TextLink href="/login">View support needs</TextLink>
              <p className="flex items-center gap-2 text-xs text-subtle">
                <ShieldCheck className="h-4 w-4 text-verified" weight="fill" />
                Support never affects official statistics.
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-border bg-surface-0 p-5 sm:p-8">
            <div className="landing-card-grid absolute inset-0 opacity-20" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-2">ACTIVE ATHLETE GOAL</span>
                <Target className="h-7 w-7 text-brand-2" weight="duotone" />
              </div>
              <h3 className="mt-8 max-w-md text-2xl font-semibold text-text-strong">
                Back Daniel&apos;s verified assist goal
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
                Support a six-assist development challenge approved by his Team Admin.
              </p>
              <div className="mt-8 h-2 overflow-hidden rounded-sm bg-surface-3">
                <div className="landing-progress h-full w-[58%] bg-brand" />
              </div>
              <div className="mt-3 flex justify-between font-mono text-xs">
                <span className="text-text-strong">UGX 175,000 pledged</span>
                <span className="text-subtle">58%</span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-lg font-bold text-text-strong">6</p>
                  <p className="text-xs text-subtle">supporters</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-text-strong">6</p>
                  <p className="text-xs text-subtle">assist target</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="font-mono text-lg font-bold text-pending">Pending</p>
                  <p className="text-xs text-subtle">challenge state</p>
                </div>
              </div>
              <p className="mt-6 text-xs leading-5 text-subtle">
                Demonstration data. Real payment processing is not currently enabled.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl py-24 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <SectionHeading
              eyebrow="Why GoalPlace256 is different"
              title="Sports records should mean something."
              copy="GoalPlace256 turns scattered updates into structured records. A result changes standings only after a clear, trusted confirmation flow."
            />
            <div className="mt-8">
              <TextLink href="/how-it-works">Learn how verification works</TextLink>
            </div>
          </div>
          <ol className="relative space-y-3">
            {[
              ['A team submits the result', 'The score enters the system as a visible claim.', Broadcast],
              ['The opponent reviews it', 'The opposing Team Admin confirms or disputes it.', Eye],
              ['The result becomes official', 'A trusted system finalizes confirmed results.', SealCheck],
              ['Records update', 'Standings, team records, and athlete statistics can now move.', TrendUp],
            ].map(([title, description, Icon], index) => (
              <li
                key={title as string}
                className="group grid grid-cols-[3rem_1fr_auto] items-start gap-4 rounded-lg border border-border bg-surface-1 p-4 transition duration-300 hover:border-border-strong hover:bg-surface-2 sm:p-5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-md bg-brand-subtle font-mono text-sm font-bold text-brand">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-text-strong">{title as string}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{description as string}</p>
                </div>
                <Icon
                  className="mt-1 hidden h-5 w-5 text-subtle transition-colors group-hover:text-brand sm:block"
                  weight="duotone"
                />
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-10 flex items-center gap-3 rounded-lg border border-pending/20 bg-[var(--state-pending-bg)] p-4 text-sm text-pending">
          <ClockCounterClockwise className="h-5 w-5 shrink-0" weight="bold" />
          Pending or disputed results never count toward official standings.
        </div>
      </section>

      <section className="-mx-[var(--gutter)] border-y border-border bg-[#080d12]">
        <div className="mx-auto max-w-7xl px-[var(--gutter)] py-24 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <SectionHeading
              title="Built for more than one game"
              copy="Each sport keeps its own structure, statistics, and competition rules while sharing one trusted public home."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {SPORTS.map(({ icon: Icon, name, description, color }) => (
                <article key={name} className="border-l border-border pl-5">
                  <Icon className={`h-7 w-7 ${color}`} weight="duotone" />
                  <h3 className="mt-5 text-lg font-semibold text-text-strong">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl py-24 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Better leagues create better opportunities"
              title="When leagues become visible, everyone benefits."
              copy="Digital fixtures, result confirmation, athlete profiles, dispute tracking, historical records, and sponsor reports create a stronger competition."
            />
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link
                href="/pilot"
                className="inline-flex h-12 items-center gap-2 rounded-sm bg-brand px-5 text-sm font-bold text-on-brand transition hover:bg-brand-hover active:translate-y-px"
              >
                <Trophy className="h-4 w-4" weight="fill" />
                Digitize your league
              </Link>
              <p className="max-w-xs text-xs leading-5 text-subtle">
                Selected pilot leagues can receive free digitization and onboarding support.
              </p>
            </div>
          </div>
          <div id="sponsors" className="rounded-lg border border-border bg-surface-1 p-6 sm:p-8">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-2">
              <Handshake className="h-5 w-5" weight="duotone" />
              Support with proof
            </p>
            <h2 className="mt-5 text-balance text-3xl font-semibold leading-tight text-text-strong sm:text-4xl">
              Turn community sponsorship into measurable impact.
            </h2>
            <p className="mt-5 text-sm leading-6 text-muted">
              Support athletes, teams, leagues, and development programmes with clearer reporting
              on participation, visibility, engagement, and funded needs.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border">
              {['Verified entities', 'Community reach', 'Funded-needs evidence', 'Monthly impact'].map(
                (benefit) => (
                  <div key={benefit} className="flex min-h-24 items-end bg-surface-2 p-4">
                    <p className="text-sm font-semibold text-text-strong">{benefit}</p>
                  </div>
                ),
              )}
            </div>
            <div className="mt-6">
              <TextLink href="/sponsors">Explore sponsorship</TextLink>
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mx-[var(--gutter)] overflow-hidden border-y border-border px-[var(--gutter)] py-24 sm:py-32">
        <Image
          src="/images/goalplace256-hero.png"
          alt="Grassroots sport under floodlights in Uganda"
          fill
          sizes="100vw"
          className="-z-20 object-cover object-bottom"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,7,10,0.98),rgba(5,7,10,0.78),rgba(5,7,10,0.45))]" />
        <div className="mx-auto max-w-7xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Medal className="h-5 w-5" weight="duotone" />
            Starting in Uganda. Built for Africa.
          </p>
          <h2 className="mt-6 max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.02] text-white sm:text-5xl lg:text-7xl">
            No talented athlete should remain invisible.
          </h2>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-200 sm:text-lg">
            We are building the trusted record of grassroots sports talent across Africa, starting
            with the leagues, teams, and communities shaping Uganda&apos;s game today.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl py-24 text-center sm:py-32">
        <p className="text-sm font-semibold text-brand">This is your game.</p>
        <h2 className="mx-auto mt-5 max-w-5xl text-balance font-display text-4xl font-semibold leading-[1.02] text-text-strong sm:text-5xl lg:text-7xl">
          Your league. Your team. Your athletes. One trusted platform.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg">
          Follow the action, discover talent, support local sport, and become part of the next
          chapter of African grassroots competition.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="group inline-flex h-12 items-center gap-3 rounded-sm bg-brand px-5 text-sm font-bold text-on-brand shadow-[var(--glow-brand)] transition hover:bg-brand-hover active:translate-y-px"
          >
            Enter GoalPlace256
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              weight="bold"
            />
          </Link>
          <Link
            href="/leagues"
            className="inline-flex h-12 items-center gap-2 rounded-sm border border-border-strong bg-surface-1 px-5 text-sm font-semibold text-text-strong transition hover:bg-surface-2 active:translate-y-px"
          >
            Explore leagues
          </Link>
        </div>
        <Link
          href="/pilot"
          className="mt-7 inline-flex min-h-11 items-center text-sm font-semibold text-muted transition hover:text-brand"
        >
          Bring your league to GoalPlace256
        </Link>
      </section>
    </MarketingShell>
  );
}
