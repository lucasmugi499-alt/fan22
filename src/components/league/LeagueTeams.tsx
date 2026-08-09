'use client';

import { useMemo, useState } from 'react';
import { Buildings, Check, CheckCircle, ClipboardText, EnvelopeSimple, FileCsv, Plus, UserPlus, WarningCircle } from '@phosphor-icons/react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { RichStandings } from '@/components/premium/RichStandings';
import { TeamCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { Team } from '@/types';
import type { DataWriteResult } from '@/data/providers/types';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';

const TABS = ['Standings', 'All teams'] as const;
type Tab = (typeof TABS)[number];

export function LeagueTeams() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(() => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext), [userProfile, catalog.leagues, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches', 'athletes', 'rosters'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const seasons = catalog.seasons;
  const { teams, matches, athletes, rosters, retry } = detail;
  const loading = catalog.loading || (Boolean(league) && detail.loading);
  const [tab, setTab] = useState<Tab>('Standings');
  const [mode, setMode] = useState<'team' | 'invite' | 'import' | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteEmailDelivery, setInviteEmailDelivery] = useState<DataWriteResult['emailDelivery']>();
  const [inviteEmailError, setInviteEmailError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamCity, setTeamCity] = useState('');
  const [teamVenue, setTeamVenue] = useState('');
  const [importRows, setImportRows] = useState<Array<{ name: string; city?: string; venue?: string }>>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const submittedRosters = rosters.filter((roster) => roster.status === 'submitted');

  async function reviewRoster(rosterId: string, decision: 'confirmed' | 'returned') {
    const roster = rosters.find((item) => item.id === rosterId);
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!roster || !actorUserId) return;
    setSaving(true);
    try {
      await provider.saveRoster({
        ...roster,
        status: decision,
        approvedByUserId: actorUserId,
        updatedAt: new Date().toISOString(),
      });
      toast.success(decision === 'confirmed' ? 'Roster approved and locked.' : 'Roster returned to the team.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Roster review failed.');
    } finally {
      setSaving(false);
    }
  }

  const lTeams = useMemo(() => (league ? teamsInLeague(league.id, teams) : []), [league, teams]);
  const standings = useMemo(() => {
    if (!league) return [];
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matchesInLeague(league.id, matches), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, lTeams, matches, seasons]);
  const activeSeason = league ? currentSeasonFor(seasons, league.id, league.currentSeasonId) : undefined;

  function openOperation(nextMode: 'team' | 'invite' | 'import') {
    setInviteLink('');
    setInviteEmailDelivery(undefined);
    setInviteEmailError('');
    setMode(nextMode);
  }

  function invitationUrl(actionUrl?: string) {
    if (!actionUrl || typeof window === 'undefined') return '';
    return new URL(actionUrl, window.location.origin).toString();
  }

  async function recordInvitationResult(invitation: DataWriteResult, createdTeam: boolean) {
    const link = invitationUrl(invitation.actionUrl);
    setInviteLink(link);
    setInviteEmailDelivery(invitation.emailDelivery);
    setInviteEmailError(invitation.emailError ?? '');
    if (link) await navigator.clipboard.writeText(link).catch(() => undefined);

    if (invitation.emailDelivery === 'sent') {
      toast.success(createdTeam ? 'Team created and invitation email sent. Fallback link copied.' : 'Invitation email sent. Fallback link copied.');
      return Boolean(link);
    }
    if (invitation.emailDelivery === 'failed') {
      toast.warning(link ? 'Invitation link created, but email delivery needs attention.' : 'Invitation created, but email delivery needs attention.');
      return Boolean(link);
    }
    if (invitation.emailDelivery === 'not_configured') {
      toast.warning(link ? 'Invitation link created. Email is not configured yet.' : 'Invitation created. Email is not configured yet.');
      return Boolean(link);
    }

    toast.success(link ? 'Invitation link copied.' : 'Team Admin invitation created.');
    return Boolean(link);
  }

  async function saveOperation() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!league || !actorUserId) {
      toast.error('Your League Admin account is not ready.');
      return;
    }
    setSaving(true);
    let keepOpen = false;
    try {
      if (mode === 'team') {
        const normalizedName = teamName.trim();
        if (normalizedName.length < 2) throw new Error('Enter the team name.');
        if (lTeams.some((team) => team.name.trim().toLowerCase() === normalizedName.toLowerCase())) {
          throw new Error('A team with this name already exists in the league.');
        }
        const now = new Date().toISOString();
        const newTeamId = `${league.id}_${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        await provider.createTeams([{
          id: newTeamId,
          name: normalizedName,
          sport: league.sport,
          leagueId: league.id,
          city: teamCity.trim() || league.city,
          location: teamVenue.trim() || `${normalizedName} home venue`,
          country: 'Uganda',
          description: `${normalizedName} competes in ${league.name}.`,
          plan: 'free',
          verified: false,
          adminUserIds: [],
          totalSupport: 0,
          supportersCount: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          leaguePoints: 0,
          verificationStatus: 'pending',
          createdAt: now,
        }]);
        setTeamId(newTeamId);
        if (inviteEmail.trim()) {
          if (!inviteEmail.includes('@') || !activeSeason) throw new Error('A valid admin email and active season are required.');
          const invitation = await provider.createTeamAdminInvitation({
            id: `${newTeamId}_${inviteEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            userId: '',
            teamId: newTeamId,
            leagueId: league.id,
            seasonId: activeSeason.id,
            role: 'team_admin',
            status: 'invited',
            invitedByUserId: actorUserId,
            invitedEmail: inviteEmail.trim().toLowerCase(),
            createdAt: now,
          });
          keepOpen = await recordInvitationResult(invitation, true);
        } else {
          toast.success('Team created. You can invite its administrator when ready.');
        }
      } else if (mode === 'invite') {
        if (!teamId || !inviteEmail.includes('@') || !activeSeason) throw new Error('Choose a team, valid email, and active season.');
        const invitation = await provider.createTeamAdminInvitation({
          id: `${teamId}_${inviteEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          userId: '',
          teamId,
          leagueId: league.id,
          seasonId: activeSeason.id,
          role: 'team_admin',
          status: 'invited',
          invitedByUserId: actorUserId,
          invitedEmail: inviteEmail.trim().toLowerCase(),
          createdAt: new Date().toISOString(),
        });
        keepOpen = await recordInvitationResult(invitation, false);
      } else {
        if (!importRows.length || importErrors.length) throw new Error('Resolve the CSV validation errors first.');
        const now = new Date().toISOString();
        const imported: Team[] = importRows.map((row, index) => ({
          id: `${league.id}_${row.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `team_${index + 1}`}`,
          name: row.name.trim(),
          sport: league.sport,
          leagueId: league.id,
          city: row.city?.trim() || league.city,
          location: row.venue?.trim() || `${row.name.trim()} home venue`,
          country: 'Uganda',
          description: `${row.name.trim()} competes in ${league.name}.`,
          plan: 'free',
          verified: false,
          adminUserIds: [],
          totalSupport: 0,
          supportersCount: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          leaguePoints: 0,
          verificationStatus: 'pending',
          createdAt: now,
        }));
        await provider.createTeams(imported);
        toast.success(`${imported.length} teams imported.`);
      }
      if (!keepOpen) setMode(null);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This operation could not be completed.');
    } finally {
      setSaving(false);
    }
  }

  function readCsv(file?: File) {
    if (!file) return;
    Papa.parse<{ name?: string; city?: string; venue?: string }>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors.length) toast.error(errors[0].message);
        const rows = data.filter((row): row is { name: string; city?: string; venue?: string } => Boolean(row.name?.trim()));
        const existingNames = new Set(lTeams.map((team) => team.name.trim().toLowerCase()));
        const seen = new Set<string>();
        const validationErrors: string[] = [];
        for (const row of rows) {
          const normalized = row.name.trim().toLowerCase();
          if (seen.has(normalized)) validationErrors.push(`Duplicate CSV team: ${row.name.trim()}`);
          if (existingNames.has(normalized)) validationErrors.push(`Team already exists: ${row.name.trim()}`);
          seen.add(normalized);
        }
        if (rows.length > 40) validationErrors.push('A single import is limited to 40 teams.');
        setImportRows(rows);
        setImportErrors(validationErrors);
      },
    });
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 px-[var(--gutter)] pb-3 md:px-0">
          <h1 className="text-xl font-semibold text-text-strong">Teams</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={FileCsv} onClick={() => openOperation('import')}>Import</Button>
            <Button size="sm" icon={Plus} onClick={() => openOperation('team')}>Add team</Button>
          </div>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {tab === 'Standings' ? (
          standings.length ? (
            <RichStandings
              rows={standings}
              matches={matches}
              teamById={new Map(teams.map((t) => [t.id, t]))}
              sportById={(id) => String(teams.find((t) => t.id === id)?.sport ?? '')}
              sport={String(league?.sport ?? '')}
            />
          ) : (
            <EmptyState icon={Buildings} title="No standings yet" description="The table fills in as official results are recorded. Pending results never move it." />
          )
        ) : lTeams.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {lTeams.map((t) => (
              <TeamCard key={t.id} team={t} standing={standings.find((row) => row.teamId === t.id)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Buildings} title="No teams yet" description="Teams that join this league appear here." />
        )}
      </div>

      {league ? (
        <div className="mt-6 px-[var(--gutter)] md:px-0">
          <AthleteClaiming athletes={athletes} scope="league" targetId={league.id} onChanged={retry} />
        </div>
      ) : null}

      {submittedRosters.length ? (
        <section className="mt-6 space-y-3 px-[var(--gutter)] md:px-0">
          <div>
            <h2 className="text-base font-semibold text-text-strong">Roster approvals</h2>
            <p className="text-xs text-muted">Approval locks the submitted squad for this competition season.</p>
          </div>
          {submittedRosters.map((roster) => (
            <div key={roster.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 p-4">
              <div>
                <p className="text-sm font-semibold text-text-strong">{teams.find((team) => team.id === roster.teamId)?.name ?? roster.teamId}</p>
                <p className="text-xs text-muted">{roster.athleteIds.length} athletes / {roster.completeness}% complete</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void reviewRoster(roster.id, 'returned')} disabled={saving}>Return</Button>
                <Button size="sm" icon={Check} onClick={() => void reviewRoster(roster.id, 'confirmed')} disabled={saving}>Approve</Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <Sheet
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'team' ? 'Add team and administrator' : mode === 'invite' ? 'Send Team Admin call-up' : 'Import teams'}
        description={mode === 'team' ? 'Create the club record and send its first matchday operator link if you have the admin email.' : mode === 'invite' ? 'Email the expiring assignment link and keep a fallback copy for matchday ops.' : 'CSV columns: name, city, venue'}
        footer={
          <Button
            block
            icon={inviteLink ? Check : mode === 'team' ? Plus : mode === 'invite' ? UserPlus : Check}
            onClick={inviteLink ? () => setMode(null) : saveOperation}
            disabled={saving || Boolean(importErrors.length)}
          >
            {inviteLink ? 'Done' : saving ? (mode === 'invite' || (mode === 'team' && inviteEmail.trim()) ? 'Sending...' : 'Saving...') : mode === 'team' ? (inviteEmail.trim() ? 'Create and send' : 'Create team') : mode === 'invite' ? 'Send invite' : `Import ${importRows.length} teams`}
          </Button>
        }
      >
        {mode === 'team' ? (
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-subtle">Team name<input className="field mt-2 normal-case" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Kampala City Stars" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-subtle">City or district<input className="field mt-2 normal-case" value={teamCity} onChange={(event) => setTeamCity(event.target.value)} placeholder={league?.city ?? 'Kampala'} /></label>
              <label className="block text-xs font-semibold uppercase text-subtle">Home venue<input className="field mt-2 normal-case" value={teamVenue} onChange={(event) => setTeamVenue(event.target.value)} placeholder="Public venue" /></label>
            </div>
            <label className="block text-xs font-semibold uppercase text-subtle">First Team Admin email <span className="font-normal normal-case text-muted">(optional)</span><input className="field mt-2 normal-case" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@example.com" /></label>
            <p className="text-xs leading-5 text-muted">The team begins unverified with no administrator. When an email is supplied, GoalPlace256 sends an expiring call-up link and keeps a copied fallback for matchday ops.</p>
            {inviteLink ? <InvitationLink value={inviteLink} status={inviteEmailDelivery} error={inviteEmailError} /> : null}
          </div>
        ) : mode === 'invite' ? (
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-subtle">Team<select className="field mt-2 normal-case" value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Choose team</option>{lTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label className="block text-xs font-semibold uppercase text-subtle">Admin email<input className="field mt-2 normal-case" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@example.com" /></label>
            <p className="text-xs text-muted">The recipient signs in with this email and accepts the assignment. A trusted server then issues the Team Admin claim.</p>
            {inviteLink ? <InvitationLink value={inviteLink} status={inviteEmailDelivery} error={inviteEmailError} /> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-2 p-4 text-center">
              <FileCsv className="h-7 w-7 text-brand" weight="duotone" />
              <span className="mt-2 text-sm font-semibold text-text-strong">Choose team CSV</span>
              <span className="text-xs text-muted">Required: name. Optional: city and venue.</span>
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => readCsv(event.target.files?.[0])} />
            </label>
            {importRows.length ? <p className="text-sm text-muted">{importRows.length} valid teams ready: {importRows.slice(0, 3).map((row) => row.name).join(', ')}{importRows.length > 3 ? '...' : ''}</p> : null}
            {importErrors.map((message) => <p key={message} className="text-sm text-[var(--state-error)]">{message}</p>)}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function invitationStatusCopy(status: DataWriteResult['emailDelivery']) {
  if (status === 'sent') return {
    label: 'Email sent',
    message: 'The admin has been emailed. The fallback link is copied and expires after seven days.',
    Icon: CheckCircle,
    className: 'border-[rgba(0,208,132,0.35)] bg-[rgba(0,208,132,0.12)] text-brand',
  };
  if (status === 'failed') return {
    label: 'Email failed',
    message: 'The invite exists, but email delivery needs attention. Share the fallback link while Resend is fixed.',
    Icon: WarningCircle,
    className: 'border-[rgba(255,86,86,0.35)] bg-[rgba(255,86,86,0.12)] text-[var(--state-error)]',
  };
  if (status === 'not_configured') return {
    label: 'Link ready',
    message: 'Email is not configured in this environment yet. Share the fallback link manually.',
    Icon: ClipboardText,
    className: 'border-[rgba(255,199,77,0.35)] bg-[rgba(255,199,77,0.12)] text-[var(--state-warning)]',
  };
  return {
    label: 'Link copied',
    message: 'The fallback link has been copied. It expires after seven days and only works for the invited email.',
    Icon: ClipboardText,
    className: 'border-border bg-surface-2 text-text-strong',
  };
}

function InvitationLink({ value, status, error }: { value: string; status: DataWriteResult['emailDelivery']; error?: string }) {
  const copy = invitationStatusCopy(status);
  const Icon = copy.Icon;
  return (
    <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface-1 p-3">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${copy.className}`}>
          <Icon className="h-5 w-5" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-strong">{copy.label}</p>
            {status === 'sent' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,208,132,0.35)] bg-[rgba(0,208,132,0.1)] px-2 py-0.5 text-[11px] font-semibold uppercase text-brand">
                <EnvelopeSimple className="h-3.5 w-3.5" weight="bold" />
                Resend
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{copy.message}</p>
          {error ? <p className="mt-1 text-xs leading-5 text-[var(--state-error)]">{error}</p> : null}
        </div>
      </div>
      <label className="mt-3 block text-xs font-semibold uppercase text-subtle">
        Expiring invitation link
        <input className="field mt-2 normal-case" readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
      </label>
    </div>
  );
}
