'use client';

import { useState } from 'react';
import { CalendarPlus, Check, Megaphone } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { defaultScoringFor, toSportSlug } from '@/lib/season';
import type { CompetitionFormat, League, Season } from '@/types';

type Mode = 'season' | 'notice' | null;

export function LeagueOperations({
  league,
  season,
  onSaved,
}: {
  league: League;
  season?: Season;
  onSaved: () => void;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const actorUserId = currentUser?.uid ?? userProfile?.uid;
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [seasonName, setSeasonName] = useState('2027 Regular Season');
  const [startDate, setStartDate] = useState('2027-01-16');
  const [endDate, setEndDate] = useState('2027-11-30');
  const [competitionFormat, setCompetitionFormat] = useState<CompetitionFormat>('league');
  const defaults = defaultScoringFor(league.sport);
  const [winPoints, setWinPoints] = useState(String(defaults.win));
  const [drawPoints, setDrawPoints] = useState(defaults.draw === null ? '' : String(defaults.draw));
  const [lossPoints, setLossPoints] = useState(String(defaults.loss));
  const [noticeType, setNoticeType] = useState<'fixture_update' | 'postponement' | 'registration' | 'verification_reminder' | 'sponsor_message' | 'emergency'>('fixture_update');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [audience, setAudience] = useState<'public' | 'all_teams' | 'team_admins' | 'athletes'>('public');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');

  async function save() {
    if (!mode || !actorUserId) {
      toast.error('Your League Admin account is not ready.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'season') {
        if (!seasonName.trim() || !startDate) throw new Error('Add a season name and start date.');
        await provider.createSeason({
          leagueId: league.id,
          name: seasonName.trim(),
          sport: toSportSlug(league.sport),
          status: 'registration',
          startDate: new Date(`${startDate}T00:00:00Z`).toISOString(),
          endDate: endDate ? new Date(`${endDate}T23:59:59Z`).toISOString() : undefined,
          competitionFormat,
          scoring: {
            win: Number(winPoints),
            draw: drawPoints === '' ? null : Number(drawPoints),
            loss: Number(lossPoints),
          },
        });
        toast.success('Season opened for registration.');
      } else {
        if (!season?.id || !noticeTitle.trim() || !noticeMessage.trim()) {
          throw new Error('Add a title, message, and active season.');
        }
        await provider.createLeagueNotice({
          leagueId: league.id,
          seasonId: season.id,
          type: noticeType,
          title: noticeTitle.trim(),
          message: noticeMessage.trim(),
          audience,
          priority,
          publishedByUserId: actorUserId,
        });
        toast.success('League notice published.');
      }
      setMode(null);
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This league update could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function advanceSeason() {
    if (!season) return;
    const next = {
      draft: 'registration',
      registration: 'active',
      active: 'completed',
      completed: 'archived',
      archived: 'archived',
    }[season.status] as Season['status'];
    setSaving(true);
    try {
      await provider.transitionSeason(season.id, next);
      toast.success(`Season moved to ${next}.`);
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Season status could not be changed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={CalendarPlus} onClick={() => setMode('season')}>New season</Button>
        <Button variant="secondary" icon={Megaphone} onClick={() => setMode('notice')}>Publish notice</Button>
      </div>
      {season && season.status !== 'archived' ? (
        <Button block variant="secondary" onClick={() => void advanceSeason()} disabled={saving}>
          {season.status === 'registration' ? 'Activate season' : season.status === 'active' ? 'Complete season' : season.status === 'completed' ? 'Archive season' : 'Open registration'}
        </Button>
      ) : null}
      <Sheet
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'season' ? 'Launch a season' : 'League communications'}
        description={mode === 'season' ? 'Open registration with sport-specific scoring.' : 'Publish to the public feed and operational inboxes.'}
        footer={<Button block icon={Check} onClick={save} disabled={saving}>{saving ? 'Saving...' : mode === 'season' ? 'Open registration' : 'Publish notice'}</Button>}
      >
        {mode === 'season' ? (
          <div className="space-y-4">
            <Field label="Season name"><input className="field" value={seasonName} onChange={(event) => setSeasonName(event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
              <Field label="Ends"><input className="field" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
            </div>
            <Field label="Competition format"><select className="field" value={competitionFormat} onChange={(event) => setCompetitionFormat(event.target.value as CompetitionFormat)}><option value="league">League</option><option value="knockout">Knockout</option><option value="group_knockout">Groups and knockout</option></select></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Win"><input className="field" type="number" min="0" value={winPoints} onChange={(event) => setWinPoints(event.target.value)} /></Field>
              <Field label="Draw"><input className="field" type="number" min="0" value={drawPoints} onChange={(event) => setDrawPoints(event.target.value)} disabled={defaults.draw === null} placeholder="N/A" /></Field>
              <Field label="Loss"><input className="field" type="number" min="0" value={lossPoints} onChange={(event) => setLossPoints(event.target.value)} /></Field>
            </div>
            <p className="text-xs text-muted">Format and scoring lock when the season becomes active. Cash performance challenges remain disabled for pilot leagues.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Notice type"><select className="field" value={noticeType} onChange={(event) => setNoticeType(event.target.value as typeof noticeType)}><option value="fixture_update">Fixture change</option><option value="postponement">Postponement</option><option value="registration">Registration</option><option value="verification_reminder">Verification reminder</option><option value="sponsor_message">Sponsor message</option><option value="emergency">Emergency</option></select></Field>
            <Field label="Title"><input className="field" value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} /></Field>
            <Field label="Message"><textarea className="field min-h-28 py-3" value={noticeMessage} onChange={(event) => setNoticeMessage(event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Audience"><select className="field" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="public">Public</option><option value="all_teams">All teams</option><option value="team_admins">Team Admins</option><option value="athletes">Athletes</option></select></Field>
              <Field label="Priority"><select className="field" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></Field>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase text-subtle">{label}<span className="mt-2 block normal-case">{children}</span></label>;
}
