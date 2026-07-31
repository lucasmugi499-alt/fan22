'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, MagnifyingGlass, UserCirclePlus, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Athlete, AthleteClaim } from '@/types';

export function AthleteClaiming({
  athletes,
  scope,
  targetId,
  onChanged,
}: {
  athletes: Athlete[];
  scope?: 'team' | 'league';
  targetId?: string;
  onChanged?: () => void;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const userId = currentUser?.uid ?? userProfile?.uid;
  const [claims, setClaims] = useState<AthleteClaim[]>([]);
  const [query, setQuery] = useState('');
  const [invitedAthleteId, setInvitedAthleteId] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [saving, setSaving] = useState<string>();

  async function load() {
    if (!userId) return;
    setClaims(await provider.getAthleteClaims(scope === 'team'
      ? { teamId: targetId }
      : scope === 'league'
        ? { leagueId: targetId }
        : { userId }));
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const options = scope === 'team'
      ? { teamId: targetId }
      : scope === 'league'
        ? { leagueId: targetId }
        : { userId };
    provider.getAthleteClaims(options).then((items) => {
      if (!cancelled) setClaims(items);
    }).catch(() => {
      if (!cancelled) setClaims([]);
    });
    return () => { cancelled = true; };
  }, [scope, targetId, userId, provider]);

  useEffect(() => {
    if (scope || typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('claim') ?? '';
    const invited = token ? athletes[0] : undefined;
    if (invited) {
      queueMicrotask(() => {
        setInviteToken(token);
        setInvitedAthleteId(invited.id);
        setQuery(invited.name);
      });
    }
    if (!token && userProfile?.name && !query) {
      queueMicrotask(() => setQuery(userProfile.name));
    }
  }, [athletes, query, scope, userProfile?.name]);

  const candidates = useMemo(() => athletes
    .filter((athlete) => !query.trim() || `${athlete.name} ${athlete.position} ${athlete.city}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => Number(right.id === invitedAthleteId) - Number(left.id === invitedAthleteId))
    .slice(0, 12), [athletes, invitedAthleteId, query]);
  const visibleClaims = claims.filter((claim) =>
    scope === 'team' ? claim.status === 'team_pending' :
      scope === 'league' ? claim.status === 'league_pending' : true,
  );

  async function requestClaim(athleteId: string) {
    if (!userId) return;
    setSaving(athleteId);
    try {
      await provider.requestAthleteClaim(athleteId, userId, inviteToken);
      await load();
      toast.success('Invite accepted. Sent to League verification.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Claim could not be requested.');
    } finally {
      setSaving(undefined);
    }
  }

  async function review(claim: AthleteClaim, action: 'team_confirm' | 'league_verify' | 'reject') {
    if (!userId) return;
    const reason = action === 'reject' ? window.prompt('Reason for rejection')?.trim() : undefined;
    if (action === 'reject' && !reason) return;
    setSaving(claim.id);
    try {
      await provider.reviewAthleteClaim(claim.id, userId, action, reason);
      await load();
      onChanged?.();
      toast.success(action === 'team_confirm' ? 'Sent to League verification.' : action === 'league_verify' ? 'Athlete account linked.' : 'Claim rejected.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Claim review failed.');
    } finally {
      setSaving(undefined);
    }
  }

  if (scope) {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-text-strong">Athlete profile claims</h2>
          <p className="text-xs text-muted">{scope === 'team' ? 'Confirm the athlete belongs to this team.' : 'Verify the confirmed affiliation before linking the account.'}</p>
        </div>
        {visibleClaims.length ? visibleClaims.map((claim) => {
          const athlete = athletes.find((item) => item.id === claim.athleteId);
          const positiveAction = scope === 'team' ? 'team_confirm' : 'league_verify';
          return (
            <Card key={claim.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-strong">{athlete?.name ?? claim.athleteId}</p>
                <p className="text-xs text-muted">{athlete?.position} / {claim.status.replaceAll('_', ' ')}</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="secondary" icon={XCircle} aria-label="Reject claim" disabled={saving === claim.id} onClick={() => void review(claim, 'reject')} />
                <Button size="sm" icon={CheckCircle} disabled={saving === claim.id} onClick={() => void review(claim, positiveAction)}>
                  {scope === 'team' ? 'Confirm' : 'Link'}
                </Button>
              </div>
            </Card>
          );
        }) : <EmptyState icon={UserCirclePlus} title="No claims waiting" description="New athlete account claims will appear here." />}
      </section>
    );
  }

  const activeClaim = visibleClaims.find((claim) => ['team_pending', 'league_pending'].includes(claim.status));
  if (activeClaim) {
    return (
      <EmptyState
        icon={UserCirclePlus}
        title="Profile claim under review"
        description={activeClaim.status === 'team_pending'
          ? 'Your Team Admin must confirm your affiliation next.'
          : 'Team confirmation is complete. The League Admin must verify the link.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">{inviteToken ? 'Create your athlete account' : 'Athlete invitation required'}</h1>
        <p className="text-sm text-muted">{inviteToken
          ? 'Accept the profile your Team Admin created for you. League verification protects the career record before the account is linked.'
          : 'Ask your Team Admin to create your roster profile and send your private athlete account invitation.'}</p>
      </div>
      {inviteToken ? null : (
        <label className="relative block">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, position, or city" className="field pl-9" />
        </label>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {(inviteToken ? candidates.filter((athlete) => athlete.id === invitedAthleteId) : candidates).map((athlete) => (
          <Card key={athlete.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-strong">{athlete.name}</p>
              <p className="truncate text-xs text-muted">{athlete.position} / {athlete.city}{athlete.userId ? ' / linked profile' : ''}</p>
            </div>
            <Button size="sm" variant="secondary" disabled={saving === athlete.id || Boolean(athlete.userId) || !inviteToken} onClick={() => void requestClaim(athlete.id)}>
              {athlete.userId ? 'Linked' : inviteToken ? 'Accept invite' : 'Invite only'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
