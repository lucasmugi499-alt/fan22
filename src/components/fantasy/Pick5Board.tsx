'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Crown, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import {
  PICK5_MAX_FROM_REAL_TEAM,
  PICK5_SIZE,
  scoutOwnershipThreshold,
  validatePick5Lineup,
} from '@/lib/fantasy/pick5';
import type { FantasyCompetition, FantasyPlayer } from '@/types/fantasy';
import { cn } from '@/lib/utils';

export type Pick5PlayerCard = FantasyPlayer & {
  name: string;
  avatarUrl: string;
  teamName: string;
};

/**
 * The whole game on one screen, playable in under a minute on a cheap phone.
 *
 * Five slots, one captain, one scout. No budget arithmetic, no bench, no transfer market, no
 * positional quotas to satisfy. The constraint that matters — at most two from any one club —
 * is enforced as you tap rather than reported after you submit, because a rule you discover
 * at the confirm step is a rule that wasted your time.
 */
export function Pick5Board({
  competition,
  players,
  roundId,
  roundNumber,
  deadlineAt,
  leagueName,
}: {
  competition: FantasyCompetition;
  players: Pick5PlayerCard[];
  roundId: string;
  roundNumber: number;
  deadlineAt: string;
  leagueName: string;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const storageKey = `goalplace:fantasy-pick5:${competition.id}:${roundId}`;
  const [selected, setSelected] = useState<string[]>([]);
  const [captain, setCaptain] = useState('');
  const [scout, setScout] = useState('');
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const scoutThreshold = scoutOwnershipThreshold(competition);

  /*
   * The draft survives a reload. On a poor connection the pick screen is the one place a
   * dropped request must not cost the manager their choices.
   */
  useEffect(() => {
    /*
     * Restored after the first paint rather than during it. The saved draft cannot be part of
     * the initial state without diverging from the server-rendered markup, and setting it
     * synchronously inside the effect makes React re-render before it has committed.
     */
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (!saved) return;
        const draft = JSON.parse(saved) as { selected?: string[]; captain?: string; scout?: string };
        setSelected(draft.selected ?? []);
        setCaptain(draft.captain ?? '');
        setScout(draft.scout ?? '');
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!selected.length) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ selected, captain, scout }));
  }, [captain, scout, selected, storageKey]);

  const playerByAthlete = useMemo(
    () => new Map(players.map((player) => [player.athleteId, player])),
    [players],
  );
  const selectedPlayers = selected.flatMap((athleteId) => {
    const player = playerByAthlete.get(athleteId);
    return player ? [player] : [];
  });
  const clubCounts = selectedPlayers.reduce<Record<string, number>>((counts, player) => {
    counts[player.realTeamId] = (counts[player.realTeamId] ?? 0) + 1;
    return counts;
  }, {});

  const validation = validatePick5Lineup({
    lineup: { squadAthleteIds: selected, captainAthleteId: captain, scoutAthleteId: scout },
    players,
    competition,
    // The client checks the same rules so the button can explain itself; the server decides.
    serverNow: new Date().toISOString(),
    deadlineAt,
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return players.filter((player) =>
      player.active
      && player.availability !== 'suspended'
      && player.availability !== 'unavailable'
      && (!term || `${player.name} ${player.teamName} ${player.position}`.toLowerCase().includes(term)));
  }, [players, query]);

  function blockedReason(player: Pick5PlayerCard): string | null {
    if (selected.includes(player.athleteId)) return null;
    if (selected.length >= PICK5_SIZE) return 'You already have five.';
    if ((clubCounts[player.realTeamId] ?? 0) >= PICK5_MAX_FROM_REAL_TEAM) {
      return `Already ${PICK5_MAX_FROM_REAL_TEAM} from ${player.teamName}.`;
    }
    return null;
  }

  function toggle(player: Pick5PlayerCard) {
    if (selected.includes(player.athleteId)) {
      setSelected((current) => current.filter((id) => id !== player.athleteId));
      if (captain === player.athleteId) setCaptain('');
      if (scout === player.athleteId) setScout('');
      return;
    }
    if (blockedReason(player)) return;
    setSelected((current) => [...current, player.athleteId]);
  }

  async function submit() {
    setSubmitting(true);
    setMessage('');
    try {
      if (isDemoMode || !currentUser) {
        setMessage('Sign in with a Fan account to submit your picks.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/fantasy/pick5', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          competitionId: competition.id,
          roundId,
          teamName: `${competition.shortName} Five`,
          squadAthleteIds: selected,
          captainAthleteId: captain,
          scoutAthleteId: scout,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string; errors?: string[] } | null;
      setMessage(response.ok
        ? 'Picks confirmed. The server deadline now protects this lineup.'
        : result?.errors?.join(' ') ?? result?.error ?? 'Your picks could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  const deadlineLabel = new Intl.DateTimeFormat('en-UG', {
    weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(deadlineAt));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Pick 5</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          Round {roundNumber}
        </h1>
        <p className="mt-1 text-sm text-muted">{leagueName} · locks {deadlineLabel}</p>
        <p className="mt-2 text-sm text-text">
          {selected.length} of {PICK5_SIZE} picked.
          {scout ? '' : ' One scout slot still open.'} Captain scores double.
        </p>
      </header>

      {/* The five slots, always visible, so the state of the lineup is never a scroll away. */}
      <ol className="mt-5 space-y-2">
        {Array.from({ length: PICK5_SIZE }).map((_, index) => {
          const player = selectedPlayers[index];
          if (!player) {
            const isScoutSlot = index === PICK5_SIZE - 1 && !scout;
            return (
              <li
                key={`empty-${index}`}
                className="flex min-h-[68px] items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-border px-4 text-sm text-subtle"
              >
                {isScoutSlot ? (
                  <>
                    <Star className="h-5 w-5 text-[var(--state-pending)]" />
                    <span>
                      <span className="block font-semibold text-muted">Scout slot</span>
                      Someone owned by under {scoutThreshold} percent
                    </span>
                  </>
                ) : (
                  <span>Tap an athlete below to fill slot {index + 1}</span>
                )}
              </li>
            );
          }
          return (
            <li
              key={player.athleteId}
              className="flex min-h-[68px] items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 py-2"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-surface-2">
                <Image src={player.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text-strong">{player.name}</p>
                <p className="truncate text-xs uppercase tracking-wide text-muted">
                  {player.position} · {player.teamName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <SlotToggle
                  active={captain === player.athleteId}
                  label={captain === player.athleteId ? 'Captain' : 'Make captain'}
                  onClick={() => setCaptain(captain === player.athleteId ? '' : player.athleteId)}
                  tone="brand"
                >
                  <Crown className="h-4 w-4" weight={captain === player.athleteId ? 'fill' : 'regular'} />
                </SlotToggle>
                <SlotToggle
                  active={scout === player.athleteId}
                  disabled={player.ownershipPercentage >= scoutThreshold}
                  label={player.ownershipPercentage >= scoutThreshold
                    ? `Owned by ${player.ownershipPercentage}%, too popular to scout`
                    : scout === player.athleteId ? 'Scout pick' : 'Make scout pick'}
                  onClick={() => setScout(scout === player.athleteId ? '' : player.athleteId)}
                  tone="gold"
                >
                  <Star className="h-4 w-4" weight={scout === player.athleteId ? 'fill' : 'regular'} />
                </SlotToggle>
                <button
                  type="button"
                  aria-label={`Remove ${player.name}`}
                  onClick={() => toggle(player)}
                  className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text-strong"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <label className="relative mt-6 block">
        <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search athletes, clubs or positions"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 pl-10 pr-3 text-sm text-text-strong placeholder:text-subtle"
        />
      </label>

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {filtered.slice(0, 60).map((player) => {
          const isSelected = selected.includes(player.athleteId);
          const blocked = blockedReason(player);
          const scoutEligible = player.ownershipPercentage < scoutThreshold;
          return (
            <li key={player.athleteId}>
              <button
                type="button"
                onClick={() => toggle(player)}
                disabled={Boolean(blocked)}
                // A blocked pick says why on hover and on tap. A greyed control with no
                // explanation is the most common failure in selection UIs.
                title={blocked ?? undefined}
                className={cn(
                  'grid min-h-[68px] w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left transition',
                  isSelected && 'bg-brand-subtle/30',
                  blocked && 'opacity-45',
                )}
              >
                <div className="relative h-11 w-11 overflow-hidden rounded-full bg-surface-2">
                  <Image src={player.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text-strong">{player.name}</p>
                  <p className="truncate text-xs text-muted">{player.teamName} · {player.position}</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {player.ownershipPercentage}% owned
                    {scoutEligible ? <span className="text-[var(--state-pending)]"> · scout eligible</span> : null}
                    {blocked ? <span className="text-[var(--state-error)]"> · {blocked}</span> : null}
                  </p>
                </div>
                <span className={cn('pr-1 text-xs font-semibold', isSelected ? 'text-brand' : 'text-subtle')}>
                  {isSelected ? 'Picked' : 'Add'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Confirm stays reachable one-handed without scrolling back up. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-30 border-t border-border bg-surface-0/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl">
          {message ? <p className="mb-2 text-sm text-text">{message}</p> : null}
          {!validation.valid && selected.length > 0 ? (
            <p className="mb-2 text-xs text-subtle">{validation.errors[0]}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!validation.valid || submitting}
            className={cn(
              'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
              validation.valid && !submitting
                ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
                : 'cursor-not-allowed bg-surface-3 text-subtle',
            )}
          >
            {submitting ? 'Confirming…' : 'Confirm picks'}
          </button>
        </div>
      </div>
    </main>
  );
}

function SlotToggle({
  active,
  disabled,
  label,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  tone: 'brand' | 'gold';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-11 w-11 place-items-center rounded-full border transition',
        active && tone === 'brand' && 'border-brand bg-brand-subtle text-brand',
        active && tone === 'gold' && 'border-[var(--state-pending)] bg-[color-mix(in_srgb,var(--state-pending),transparent_85%)] text-[var(--state-pending)]',
        !active && 'border-border text-muted hover:text-text-strong',
        disabled && 'cursor-not-allowed opacity-35 hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}
