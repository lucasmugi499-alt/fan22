'use client';

import { Card } from '@/components/ui/Card';
import { getGoalPlaceIndexSignals, leagueRankingDisclaimer } from '@/lib/leagueModel';
import type { League } from '@/types';

/**
 * How the GoalPlace Index was calculated, on the page that shows it.
 *
 * ## Why this exists
 *
 * The index was a stored constant. It appeared on every league card, sorted the discovery
 * feed, and the product's own copy said it "helps leagues prove operational quality to
 * sponsors, athletes, and fans" — and nothing computed it. Every league the platform created
 * was assigned the literal value 45.
 *
 * `getGoalPlaceIndexSignals` existed to describe the breakdown and was rendered nowhere, which
 * is how the fabricated sub-scores inside it survived: dead code that produces plausible
 * numbers looks harmless until somebody wires it up.
 *
 * So the number is now computed, and this is where it shows its working. "How is the index
 * calculated?" is the first question anyone asks about it, and the honest answer has to be a
 * screen rather than a paragraph in a deck.
 *
 * ## What it deliberately does not do
 *
 * Render anything at all when the league has not been rated. No zero, no partial bar, no
 * "calculating…" that never resolves. A league with too few fixtures for the ratios to mean
 * anything has no index, and the absence is the honest state.
 */
export function IndexBreakdown({ league }: { league: League }) {
  const signals = getGoalPlaceIndexSignals(league);
  if (typeof league.goalPlaceIndex !== 'number' || !signals.length) return null;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            GoalPlace Index
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-text-strong">
            <span className="tabular tabular-nums">{league.goalPlaceIndex}</span>
            <span className="text-base font-medium text-subtle"> / 100</span>
          </h2>
        </div>
        {league.indexComputedAt ? (
          <p className="text-xs text-subtle">
            Recalculated {new Date(league.indexComputedAt).toLocaleDateString()}
          </p>
        ) : null}
      </div>

      <dl className="mt-4 space-y-3">
        {signals.map((signal) => (
          <div key={signal.label}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm font-medium text-text-strong">{signal.label}</dt>
              <dd className="tabular tabular-nums text-sm font-semibold text-text-strong">
                {signal.value}%
              </dd>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.max(0, Math.min(100, signal.value))}%` }}
              />
            </div>
            {/* The counts, not only the percentage. "38 of 40" is checkable against the
                fixture list on this same page; "95%" has to be taken on trust. */}
            <p className="mt-1 text-xs text-muted">{signal.detail}</p>
          </div>
        ))}
      </dl>

      <p className="mt-4 border-t border-border pt-3 text-xs text-subtle">
        {leagueRankingDisclaimer}
      </p>
    </Card>
  );
}
