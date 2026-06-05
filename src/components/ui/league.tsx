'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Lock, ShieldCheck, Trophy } from 'lucide-react';
import {
  getGoalPlaceIndexSignals,
  getLeagueStatusMeta,
  leagueRankingDisclaimer,
  leagueStatuses,
  LeagueStanding,
} from '@/lib/leagueModel';
import { League, LeagueStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LeagueStatusBadge({
  status,
  className,
}: {
  status: LeagueStatus;
  className?: string;
}) {
  const meta = getLeagueStatusMeta(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]',
        meta.badgeClass,
        className
      )}
    >
      {status === 'draft' && <Lock className="size-3" />}
      {status === 'community' && <ClipboardCheck className="size-3" />}
      {status === 'verified' && <ShieldCheck className="size-3" />}
      {status === 'partner' && <CheckCircle2 className="size-3" />}
      {status === 'suspended' && <AlertTriangle className="size-3" />}
      {meta.shortLabel}
    </span>
  );
}

export function LeagueIntegrityNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-4 text-sm leading-6 text-slate-200',
        className
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[var(--goal-mint)]">
        <Trophy className="size-4" />
        <p className="font-heading text-base font-black text-white">Sporting Integrity</p>
      </div>
      <p>{leagueRankingDisclaimer}</p>
    </div>
  );
}

export function LeagueStatusRoadmap({
  activeStatus,
  className,
}: {
  activeStatus?: LeagueStatus;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-5', className)}>
      {leagueStatuses.map((status) => {
        const meta = getLeagueStatusMeta(status);
        const active = activeStatus === status;

        return (
          <div
            key={status}
            className={cn(
              'rounded-xl border p-4 transition-colors',
              meta.panelClass,
              active && 'shadow-[0_0_34px_rgba(0,196,106,0.15)]'
            )}
          >
            <LeagueStatusBadge status={status} />
            <h3 className="mt-3 font-heading text-lg font-black text-white">{meta.label}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{meta.description}</p>
            <div className="mt-4 space-y-2">
              {meta.capabilities.map((capability) => (
                <div key={capability} className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--goal-mint)]" />
                  <span>{capability}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeagueStandingsTable({
  standings,
  className,
}: {
  standings: LeagueStanding[];
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/10', className)}>
      <div className="hide-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-center">P</th>
              <th className="px-4 py-3 text-center">W</th>
              <th className="px-4 py-3 text-center">D</th>
              <th className="px-4 py-3 text-center">L</th>
              <th className="px-4 py-3 text-center">For</th>
              <th className="px-4 py-3 text-center">Against</th>
              <th className="px-4 py-3 text-center">Diff</th>
              <th className="px-4 py-3 text-center">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8 bg-white/[0.03]">
            {standings.map((standing, index) => (
              <tr key={standing.teamId}>
                <td className="px-4 py-4 font-heading text-lg font-black text-white">{index + 1}</td>
                <td className="px-4 py-4 font-bold text-white">{standing.teamName}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.played}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.wins}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.draws}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.losses}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.pointsFor}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.pointsAgainst}</td>
                <td className="px-4 py-4 text-center text-slate-300">{standing.difference}</td>
                <td className="px-4 py-4 text-center font-heading text-lg font-black text-[var(--goal-mint)]">
                  {standing.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GoalPlaceIndexPanel({
  league,
  className,
}: {
  league: League;
  className?: string;
}) {
  const signals = getGoalPlaceIndexSignals(league);

  return (
    <div className={cn('glass-panel rounded-xl p-5', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--goal-mint)]">
            GoalPlace Index
          </p>
          <h3 className="mt-2 font-heading text-2xl font-black text-white">Platform quality signals</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Separate from league standings and based on verification, match completion rate, athlete profile
            completion, fan engagement, support activity, admin reliability, and media uploads.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10 px-4 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--goal-gold)]">Index</p>
          <p className="font-heading text-3xl font-black text-white">{league.goalPlaceIndex}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-white">{signal.label}</p>
              <p className="font-heading text-sm font-black text-[var(--goal-mint)]">{signal.value}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--goal-emerald)] to-[var(--goal-mint)]"
                style={{ width: `${signal.value}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{signal.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
