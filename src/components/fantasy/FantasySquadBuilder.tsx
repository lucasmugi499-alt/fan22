'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Check, MagnifyingGlass, Plus, Star, X } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { FANTASY_SQUAD_RULES } from '@/lib/fantasy/profiles';
import type { FantasyCompetition } from '@/types/fantasy';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';

export interface FantasyPlayerCard {
  athleteId: string;
  realTeamId: string;
  name: string;
  avatarUrl: string;
  teamName: string;
  position: string;
  positionGroup: string;
  availability: 'available' | 'doubtful' | 'unavailable' | 'suspended';
  verifiedRecentForm: number[];
  ownershipPercentage: number;
  credits: number;
}

export function FantasySquadBuilder({
  competition,
  players,
  roundId,
  deadlineAt,
}: {
  competition: FantasyCompetition;
  players: FantasyPlayerCard[];
  roundId: string;
  deadlineAt: string;
}) {
  const rules = FANTASY_SQUAD_RULES.find((item) => item.id === competition.squadRulesId)!;
  const { currentUser, isDemoMode } = useAuth();
  const storageKey = `goalplace:fantasy-draft:${competition.id}:${roundId}`;
  const [selected, setSelected] = useState<string[]>([]);
  const [captain, setCaptain] = useState('');
  const [viceCaptain, setViceCaptain] = useState('');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('all');
  const [activePlayer, setActivePlayer] = useState<FantasyPlayerCard | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState('');

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft) return;
    const timer = window.setTimeout(() => {
    try {
      const draft = JSON.parse(savedDraft) as { selected?: string[]; captain?: string; viceCaptain?: string };
      setSelected(draft.selected ?? []);
      setCaptain(draft.captain ?? '');
      setViceCaptain(draft.viceCaptain ?? '');
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!selected.length) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ selected, captain, viceCaptain }));
  }, [captain, selected, storageKey, viceCaptain]);

  const selectedPlayers = players.filter((player) => selected.includes(player.athleteId));
  const creditsUsed = selectedPlayers.reduce((sum, player) => sum + player.credits, 0);
  const groupCounts = new Map(
    rules.positionGroups.map((group) => [
      group.id,
      selectedPlayers.filter((player) => player.positionGroup === group.id).length,
    ]),
  );
  const teamCounts = selectedPlayers.reduce<Record<string, number>>((counts, player) => {
    counts[player.realTeamId] = (counts[player.realTeamId] ?? 0) + 1;
    return counts;
  }, {});
  const filtered = useMemo(() => players.filter((player) =>
    (position === 'all' || player.positionGroup === position)
    && `${player.name} ${player.teamName} ${player.position}`.toLowerCase().includes(query.toLowerCase()),
  ), [players, position, query]);

  function toggle(player: FantasyPlayerCard) {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1000);
    if (selected.includes(player.athleteId)) {
      setSelected((current) => current.filter((id) => id !== player.athleteId));
      if (captain === player.athleteId) setCaptain('');
      if (viceCaptain === player.athleteId) setViceCaptain('');
      return;
    }
    if (
      selected.length >= rules.squadSize
      || creditsUsed + player.credits > rules.budgetCredits
      || (teamCounts[player.realTeamId] ?? 0) >= rules.maxFromRealTeam
      || player.availability === 'unavailable'
      || player.availability === 'suspended'
    ) return;
    setSelected((current) => [...current, player.athleteId]);
  }

  const complete = selected.length === rules.squadSize && captain && viceCaptain && captain !== viceCaptain
    && rules.positionGroups.every((group) => {
      const count = groupCounts.get(group.id) ?? 0;
      return count >= group.minimum && count <= group.maximum;
    });

  async function submitSquad() {
    if (!complete || submitting) return;
    setSubmitting(true);
    setSubmissionMessage('');
    if (isDemoMode) {
      window.localStorage.setItem(storageKey, JSON.stringify({ selected, captain, viceCaptain, submitted: true }));
      setSubmissionMessage('Demo squad submitted. It will lock at the server deadline.');
      setSubmitting(false);
      return;
    }
    if (!currentUser?.getIdToken) {
      setSubmissionMessage('Sign in with a verified fan account to submit this squad.');
      setSubmitting(false);
      return;
    }
    const response = await fetch('/api/fantasy/teams', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await currentUser.getIdToken()}`,
      },
      body: JSON.stringify({
        competitionId: competition.id,
        roundId,
        teamName: `${competition.shortName} Select`,
        squadAthleteIds: selected,
        startingAthleteIds: selected.slice(0, rules.startingSize),
        benchAthleteIds: selected.slice(rules.startingSize),
        captainAthleteId: captain,
        viceCaptainAthleteId: viceCaptain,
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string; errors?: string[] } | null;
    setSubmissionMessage(response.ok
      ? 'Squad submitted. The server deadline now protects this lineup.'
      : result?.errors?.[0] ?? result?.error ?? 'Squad could not be submitted.');
    setSubmitting(false);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold capitalize text-brand">{competition.sport} fantasy</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-text-strong">Build your squad</h1>
          <p className="mt-2 text-sm text-muted">Drafts save on this device. Server time enforces the final deadline.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Round deadline</p>
          <p className="font-semibold text-text-strong">{new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(new Date(deadlineAt))}</p>
        </div>
      </div>

      <div className="sticky top-[var(--topbar-h)] z-20 -mx-4 mt-6 grid grid-cols-3 border-y border-border bg-surface-0/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:bg-surface-1">
        <Stat label="Selected" value={`${selected.length}/${rules.squadSize}`} valid={selected.length === rules.squadSize} />
        <Stat label="Credits left" value={(rules.budgetCredits - creditsUsed).toFixed(1)} valid={creditsUsed <= rules.budgetCredits} />
        <Stat label="Draft" value={saved ? 'Saved' : 'Offline ready'} valid />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <div className="border border-border bg-surface-1 p-4">
            <h2 className="font-semibold text-text-strong">Squad requirements</h2>
            <div className="mt-4 space-y-3">
              {rules.positionGroups.map((group) => {
                const count = groupCounts.get(group.id) ?? 0;
                const valid = count >= group.minimum && count <= group.maximum;
                return (
                  <div key={group.id} className="flex items-center gap-3 text-sm">
                    <span className={cn('grid h-6 w-6 place-items-center rounded-full border', valid ? 'border-brand bg-brand-subtle text-brand' : 'border-border text-muted')}>
                      {valid ? <Check className="h-3.5 w-3.5" weight="bold" /> : count}
                    </span>
                    <span className="min-w-0 flex-1 text-muted">{group.label}</span>
                    <span className="text-xs text-subtle">{group.minimum}-{group.maximum}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted">Maximum {rules.maxFromRealTeam} from one real team.</p>
          </div>
          {selectedPlayers.length ? (
            <div className="border border-border bg-surface-1 p-4">
              <h2 className="font-semibold text-text-strong">Leadership</h2>
              <label className="mt-4 block text-xs text-muted" htmlFor="captain">Captain · 1.5×</label>
              <select id="captain" value={captain} onChange={(event) => setCaptain(event.target.value)} className="mt-1 min-h-11 w-full border border-border bg-surface-2 px-3 text-sm text-text-strong">
                <option value="">Choose captain</option>
                {selectedPlayers.map((player) => <option key={player.athleteId} value={player.athleteId}>{player.name}</option>)}
              </select>
              <label className="mt-3 block text-xs text-muted" htmlFor="vice">Vice-captain</label>
              <select id="vice" value={viceCaptain} onChange={(event) => setViceCaptain(event.target.value)} className="mt-1 min-h-11 w-full border border-border bg-surface-2 px-3 text-sm text-text-strong">
                <option value="">Choose vice-captain</option>
                {selectedPlayers.filter((player) => player.athleteId !== captain).map((player) => <option key={player.athleteId} value={player.athleteId}>{player.name}</option>)}
              </select>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search athletes</span>
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search athlete or team" className="min-h-11 w-full border border-border bg-surface-1 pl-10 pr-3 text-sm text-text-strong outline-none focus:border-brand" />
            </label>
            <select aria-label="Filter by position" value={position} onChange={(event) => setPosition(event.target.value)} className="min-h-11 border border-border bg-surface-1 px-3 text-sm text-text-strong">
              <option value="all">All positions</option>
              {rules.positionGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
          </div>
          <div className="mt-4 divide-y divide-border border-y border-border">
            {filtered.map((player) => {
              const isSelected = selected.includes(player.athleteId);
              return (
                <div key={player.athleteId} className="grid min-h-[76px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-2">
                  <button onClick={() => setActivePlayer(player)} className="relative h-11 w-11 overflow-hidden rounded-full bg-surface-2" aria-label={`View ${player.name}`}>
                    <Image src={player.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
                  </button>
                  <button onClick={() => setActivePlayer(player)} className="min-w-0 text-left">
                    <span className="block truncate font-semibold text-text-strong">{player.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{player.teamName} · {player.position}</span>
                    <span className="mt-1 block text-xs text-subtle">{player.ownershipPercentage}% selected · form {player.verifiedRecentForm.join(' · ')}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-right text-sm font-bold text-text-strong">{player.credits}<span className="block text-[10px] font-normal text-muted">credits</span></span>
                    <button onClick={() => toggle(player)} className={cn('grid h-11 w-11 place-items-center rounded-full border', isSelected ? 'border-brand bg-brand text-on-brand' : 'border-border-strong text-text-strong hover:border-brand')} aria-label={isSelected ? `Remove ${player.name}` : `Add ${player.name}`}>
                      {isSelected ? <X className="h-4 w-4" weight="bold" /> : <Plus className="h-4 w-4" weight="bold" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-30 border-t border-border bg-surface-1 p-3 md:bottom-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="hidden text-sm text-muted sm:block">
            {complete ? 'Squad is valid and ready.' : 'Complete the squad and choose leadership.'}
          </div>
          {submissionMessage ? <p className="hidden text-sm text-muted sm:block" role="status">{submissionMessage}</p> : null}
          <Button disabled={!complete || submitting} onClick={() => void submitSquad()} className="ml-auto w-full sm:w-auto" icon={Star}>
            {submitting ? 'Submitting…' : 'Submit squad'}
          </Button>
        </div>
      </div>

      <Sheet open={Boolean(activePlayer)} onClose={() => setActivePlayer(null)} title={activePlayer?.name ?? 'Athlete'} description={activePlayer ? `${activePlayer.teamName} · ${activePlayer.position}` : undefined} footer={activePlayer ? <Button block onClick={() => { toggle(activePlayer); setActivePlayer(null); }}>{selected.includes(activePlayer.athleteId) ? 'Remove from squad' : 'Add to squad'}</Button> : undefined}>
        {activePlayer ? (
          <div>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-full bg-surface-2">
                <Image src={activePlayer.avatarUrl} alt="" fill sizes="80px" className="object-cover" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-strong">{activePlayer.credits} <span className="text-sm font-normal text-muted">Fantasy Credits</span></p>
                <p className="mt-1 text-sm capitalize text-muted">{activePlayer.availability}</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border">
              <div className="bg-surface-1 p-4"><dt className="text-xs text-muted">Verified recent form</dt><dd className="mt-2 font-bold text-text-strong">{activePlayer.verifiedRecentForm.join(' · ')}</dd></div>
              <div className="bg-surface-1 p-4"><dt className="text-xs text-muted">Ownership</dt><dd className="mt-2 font-bold text-text-strong">{activePlayer.ownershipPercentage}%</dd></div>
            </dl>
            <p className="mt-5 text-sm leading-6 text-muted">Fantasy form comes from official performances only. Availability is informational until the server deadline locks the round.</p>
          </div>
        ) : null}
      </Sheet>
    </main>
  );
}

function Stat({ label, value, valid }: { label: string; value: string; valid: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('mt-1 font-bold tabular-nums', valid ? 'text-text-strong' : 'text-[var(--state-warning)]')}>{value}</p>
    </div>
  );
}
