import Link from 'next/link';
import {
  ArrowRight,
  Basketball,
  CheckCircle,
  Clock,
  LockSimple,
  ShieldCheck,
  SoccerBall,
  Trophy,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr';
import { FANTASY_SCORING_PROFILES, FANTASY_SQUAD_RULES } from '@/lib/fantasy/profiles';
import { budgetApplies } from '@/lib/fantasy/budget';
import type {
  FantasyCompetition,
  FantasyLeaderboardEntry,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyPointEvent,
  FantasyRound,
} from '@/types/fantasy';
import type { League } from '@/types';

const sportIcon = {
  football: SoccerBall,
  basketball: Basketball,
  rugby: Trophy,
};

const sportCopy = {
  football: 'Build an XI around verified goals, appearances, clean sheets and official results.',
  basketball: 'Select guards, wings and bigs. Official performances decide every rank.',
  rugby: 'Choose a Rugby 7s or 15s squad and score from verified match records.',
};

function FantasyNotice() {
  return (
    <div className="flex items-start gap-3 border-l-2 border-brand bg-brand-subtle px-4 py-3 text-sm text-muted">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" weight="fill" />
      <p>
        Free to play. Fantasy Credits only build squads and have no cash value. Support,
        contributions, and GoalPlace Points never affect fantasy rank.
      </p>
    </div>
  );
}

export function FantasyHub({
  competitions,
  leagueNames,
}: {
  competitions: FantasyCompetition[];
  leagueNames: Record<string, string>;
}) {
  return (
    <main className="pb-24">
      <section className="relative overflow-hidden border-b border-border bg-surface-1 px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-brand">GoalPlace Fantasy</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-bold text-text-strong sm:text-6xl">
            Pick your squad. Follow every official moment.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            Free fantasy competitions for football, basketball, and rugby, scored only
            after GoalPlace256 verifies the underlying match record.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={competitions[0] ? `/fantasy/competitions/${competitions[0].id}` : '/fantasy/how-it-works'}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-on-brand"
            >
              Choose a competition <ArrowRight className="h-4 w-4" weight="bold" />
            </Link>
            <Link
              href="/fantasy/how-it-works"
              className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 font-semibold text-text-strong"
            >
              How scoring works
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <FantasyNotice />
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-text-strong">Play your sport</h2>
              <p className="mt-1 text-sm text-muted">One account, one free team per competition.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {competitions.map((competition) => {
              const Icon = sportIcon[competition.sport];
              return (
                <Link
                  key={competition.id}
                  href={`/fantasy/competitions/${competition.id}`}
                  className="group border border-border bg-surface-1 p-5 transition-colors hover:border-brand"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-subtle text-brand">
                      <Icon className="h-6 w-6" weight="fill" />
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">
                      {competition.dataLevel} data
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-bold text-text-strong">{competition.shortName}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-muted">{sportCopy[competition.sport]}</p>
                  <p className="mt-5 text-xs text-subtle">{leagueNames[competition.leagueId]}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    Open competition <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-14 grid gap-6 border-y border-border py-9 md:grid-cols-3">
          {[
            [LockSimple, 'Lineups lock on server time', 'The full squad locks at the first kickoff of each round. Device-clock changes cannot move the deadline.'],
            [ShieldCheck, 'Verified performances only', 'Provisional points can appear live, but only official records count toward final leaderboards.'],
            [UsersThree, 'Free private mini-leagues', 'Invite friends and teammates with a code. No entry fees, cash pools, or paid advantages.'],
          ].map(([Icon, title, copy]) => {
            const ItemIcon = Icon as typeof ShieldCheck;
            return (
              <div key={String(title)} className="flex gap-3">
                <ItemIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
                <div>
                  <h3 className="font-semibold text-text-strong">{String(title)}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{String(copy)}</p>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export function FantasyHowItWorks() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 pb-24 sm:px-6">
      <p className="text-sm font-semibold text-brand">How it works</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-text-strong">
        Your selections. Official performances. One transparent score.
      </h1>
      <FantasyNotice />
      <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-4">
        {[
          ['01', 'Build', 'Choose a valid squad within your Fantasy Credit budget.'],
          ['02', 'Lock', 'Captain, vice-captain, and lineup lock at the first kickoff.'],
          ['03', 'Verify', 'Teams report results; opponents confirm; exceptions go to the league.'],
          ['04', 'Score', 'Trusted functions generate points from the official result version.'],
        ].map(([number, title, copy]) => (
          <div key={number} className="bg-surface-1 p-5">
            <span className="text-sm font-bold text-brand">{number}</span>
            <h2 className="mt-8 text-lg font-bold text-text-strong">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
          </div>
        ))}
      </div>
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-strong">Scoring by sport</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {FANTASY_SCORING_PROFILES.map((profile) => (
            <div key={profile.id} className="border border-border bg-surface-1 p-5">
              <h3 className="text-lg font-bold capitalize text-text-strong">{profile.sport}</h3>
              <p className="mt-1 text-xs text-muted">{profile.name} · version {profile.version}</p>
              <dl className="mt-5 space-y-2">
                {profile.rules.slice(0, 8).map((rule) => (
                  <div key={rule.id} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted">{rule.label}</dt>
                    <dd className="font-semibold text-text-strong">
                      {rule.points > 0 ? '+' : ''}{rule.points}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-border pt-3 text-xs text-subtle">
                Rules activate only when the league reliably records the required statistic.
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export interface FantasyCompetitionBundle {
  competition: FantasyCompetition;
  league?: League;
  rounds: FantasyRound[];
  players: FantasyPlayer[];
  prices: FantasyPlayerPrice[];
  leaderboard: FantasyLeaderboardEntry[];
  pointEvents: FantasyPointEvent[];
}

export function FantasyCompetitionOverview({ bundle }: { bundle: FantasyCompetitionBundle | null }) {
  if (!bundle) return <FantasyNotFound />;
  const { competition, league, rounds, leaderboard } = bundle;
  const rules = FANTASY_SQUAD_RULES.find((item) => item.id === competition.squadRulesId)!;
  const openRound = rounds.find((item) => item.status === 'open') ?? rounds[0];
  return (
    <main className="pb-24">
      <section className="border-b border-border bg-surface-1 px-4 py-9 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="rounded-full bg-brand-subtle px-2.5 py-1 capitalize text-brand">{competition.sport}</span>
            <span>{competition.variant.replaceAll('_', ' ')}</span>
            <span>·</span>
            <span>{competition.dataLevel} data</span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold text-text-strong sm:text-5xl">{competition.name}</h1>
          <p className="mt-3 text-muted">{league?.name} · 2026 season</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/fantasy/competitions/${competition.id}/team`} className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-on-brand">
              Build my squad
            </Link>
            <Link href={`/fantasy/competitions/${competition.id}/leaderboard`} className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 font-semibold text-text-strong">
              Leaderboard
            </Link>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div>
          <FantasyNotice />
          <section className="mt-8">
            <h2 className="text-xl font-bold text-text-strong">Competition centre</h2>
            <div className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-3">
              <Link href={`/fantasy/competitions/${competition.id}/players`} className="bg-surface-1 p-5 hover:bg-surface-2">
                <UsersThree className="h-5 w-5 text-brand" />
                <h3 className="mt-5 font-semibold text-text-strong">Player list</h3>
                <p className="mt-1 text-sm text-muted">{bundle.players.length} eligible athletes</p>
              </Link>
              <Link href={`/fantasy/competitions/${competition.id}/points`} className="bg-surface-1 p-5 hover:bg-surface-2">
                <ShieldCheck className="h-5 w-5 text-brand" />
                <h3 className="mt-5 font-semibold text-text-strong">Points centre</h3>
                <p className="mt-1 text-sm text-muted">Provisional and official explanations</p>
              </Link>
              <Link href="/fantasy/mini-leagues" className="bg-surface-1 p-5 hover:bg-surface-2">
                <Trophy className="h-5 w-5 text-brand" />
                <h3 className="mt-5 font-semibold text-text-strong">Mini-leagues</h3>
                <p className="mt-1 text-sm text-muted">Free private tables with friends</p>
              </Link>
            </div>
          </section>
          <section className="mt-9">
            <h2 className="text-xl font-bold text-text-strong">Rounds</h2>
            <div className="mt-4 divide-y divide-border border-y border-border">
              {rounds.map((round) => (
                <div key={round.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold text-text-strong">{round.name}</p>
                    <p className="mt-1 text-xs text-muted">{round.matchIds.length} fixtures</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted">{round.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <div className="border border-border bg-surface-1 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand">
              <Clock className="h-4 w-4" /> {openRound.name} deadline
            </div>
            <p className="mt-3 text-lg font-bold text-text-strong">
              {new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(new Date(openRound.deadlineAt))}
            </p>
            <dl className="mt-6 space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Squad</dt><dd className="font-semibold text-text-strong">{rules.squadSize}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Budget</dt><dd className="font-semibold text-text-strong">{budgetApplies(competition) ? `${rules.budgetCredits} credits` : 'None, pick freely'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">One real team</dt><dd className="font-semibold text-text-strong">Max {rules.maxFromRealTeam}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Captain</dt><dd className="font-semibold text-text-strong">1.5×</dd></div>
            </dl>
          </div>
          <div className="mt-4 border border-border bg-surface-1 p-5">
            <h2 className="font-semibold text-text-strong">Top managers</h2>
            <ol className="mt-4 space-y-3">
              {leaderboard.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-bold text-brand">{entry.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{entry.teamName}</span>
                  <span className="font-semibold text-text-strong">{entry.totalPoints}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}

export function FantasyLeaderboard({ bundle }: { bundle: FantasyCompetitionBundle | null }) {
  if (!bundle) return <FantasyNotFound />;
  return (
    <FantasyTablePage
      competition={bundle.competition}
      title="Official leaderboard"
      description="Only verified official Fantasy Points count here."
    >
      <div className="divide-y divide-border border-y border-border">
        {bundle.leaderboard.map((entry) => (
          <div key={entry.id} className="grid min-h-14 grid-cols-[44px_1fr_auto] items-center gap-3">
            <span className="font-display text-lg font-bold text-brand">{entry.rank}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-strong">{entry.teamName}</p>
              <p className="text-xs text-muted">{entry.roundsPlayed} rounds · {entry.previousRank && entry.previousRank > entry.rank ? `up ${entry.previousRank - entry.rank}` : 'steady'}</p>
            </div>
            <span className="text-lg font-bold tabular-nums text-text-strong">{entry.totalPoints}</span>
          </div>
        ))}
      </div>
    </FantasyTablePage>
  );
}

export function FantasyPoints({ bundle }: { bundle: FantasyCompetitionBundle | null }) {
  if (!bundle) return <FantasyNotFound />;
  return (
    <FantasyTablePage
      competition={bundle.competition}
      title="Points centre"
      description="Every point keeps its match, result version, source event, and scoring rule."
    >
      <div className="space-y-3">
        {bundle.pointEvents.map((event) => (
          <div key={event.id} className="border border-border bg-surface-1 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {event.status === 'official' ? <CheckCircle className="h-5 w-5 text-brand" weight="fill" /> : <Clock className="h-5 w-5 text-[var(--state-warning)]" />}
                <div>
                  <p className="font-semibold capitalize text-text-strong">{event.scoringRuleId.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted">Result version {event.officialResultVersion || 'awaiting verification'}</p>
                </div>
              </div>
              <span className="text-xl font-bold text-text-strong">+{event.basePoints}</span>
            </div>
            <p className="mt-3 text-xs font-semibold capitalize text-muted">{event.status.replaceAll('_', ' ')}</p>
          </div>
        ))}
      </div>
    </FantasyTablePage>
  );
}

export function FantasyPlayersDirectory({
  competition,
  children,
}: {
  competition: FantasyCompetition | null;
  children: React.ReactNode;
}) {
  if (!competition) return <FantasyNotFound />;
  return (
    <FantasyTablePage competition={competition} title="Player list" description="Availability, verified form, price, and ownership in one low-data list.">
      {children}
    </FantasyTablePage>
  );
}

function FantasyTablePage({
  competition,
  title,
  description,
  children,
}: {
  competition: FantasyCompetition;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6">
      <Link href={`/fantasy/competitions/${competition.id}`} className="text-sm font-semibold text-brand">← {competition.shortName}</Link>
      <h1 className="mt-4 font-display text-3xl font-bold text-text-strong">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{description}</p>
      <div className="mt-8">{children}</div>
    </main>
  );
}

function FantasyNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-bold text-text-strong">Competition not found</h1>
      <p className="mt-3 text-muted">This fantasy competition is unavailable or has not been approved.</p>
      <Link href="/fantasy" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-on-brand">Browse fantasy</Link>
    </main>
  );
}
