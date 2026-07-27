'use client';

import { useState } from 'react';
import {
  CalendarCheck,
  DownloadSimple,
  FlagCheckered,
  ShareNetwork,
  Target,
  Trophy,
} from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import type { Athlete, Challenge, League, Match, Season, SupportNeed, Team } from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';

export function CareerPassport({
  athlete,
  team,
  league,
  seasons,
  matches,
  challenges,
  supportNeeds,
}: {
  athlete: Athlete;
  team?: Team;
  league?: League;
  seasons: Season[];
  matches: Match[];
  challenges: Challenge[];
  supportNeeds: SupportNeed[];
}) {
  const [sharing, setSharing] = useState(false);
  const officialMatches = matches.filter((match) =>
    (match.homeTeamId === athlete.teamId || match.awayTeamId === athlete.teamId) &&
    match.verificationStatus === 'verified');
  const milestones = [
    {
      date: new Date(athlete.createdAt).getFullYear(),
      title: `Joined ${team?.name ?? 'GoalPlace256'}`,
      copy: 'Career profile established with a structured team and league record.',
      icon: FlagCheckered,
    },
    {
      date: league?.season ?? '2026',
      title: `${officialMatches.length} official team results`,
      copy: 'Only finalized matches contribute to this career history.',
      icon: CalendarCheck,
    },
    {
      date: league?.season ?? '2026',
      title: `${athlete.goalPlacePoints.toLocaleString()} GoalPlace Points`,
      copy: 'Earned through verified participation and profile activity, not support spend.',
      icon: Trophy,
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-surface-2 p-4 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-brand">Athlete Career Passport</p>
            <h2 className="mt-1 text-xl font-semibold text-text-strong">Verified career record</h2>
          </div>
          <Button size="sm" variant="secondary" icon={ShareNetwork} onClick={() => setSharing(true)} className="mt-3 sm:mt-0">
            Share card
          </Button>
        </div>
        <ol className="p-4">
          {milestones.map(({ date, title, copy, icon: Icon }, index) => (
            <li key={title} className="relative grid grid-cols-[3rem_1fr] gap-3 pb-5 last:pb-0">
              {index < milestones.length - 1 ? <span className="absolute bottom-0 left-6 top-10 w-px bg-border" /> : null}
              <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-2 text-brand">
                <Icon className="h-4 w-4" weight="bold" />
              </span>
              <div>
                <p className="text-xs font-semibold text-brand">{date}</p>
                <p className="text-sm font-semibold text-text-strong">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong">
            <Target className="h-4 w-4 text-brand" weight="bold" /> Active development
          </h2>
          <div className="mt-3 space-y-3">
            {challenges.slice(0, 3).map((challenge) => (
              <div key={challenge.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <p className="text-sm font-semibold text-text-strong">{challenge.description}</p>
                <p className="mt-1 text-xs text-muted">UGX {challenge.totalPledged.toLocaleString()} pledged / {challenge.supportersCount} supporters</p>
                <div className="mt-2"><VerificationBadge status={challenge.verificationStatus} size="sm" /></div>
              </div>
            ))}
            {!challenges.length ? <p className="text-sm text-muted">No active challenges.</p> : null}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-text-strong">Support needs</h2>
          <div className="mt-3 space-y-3">
            {supportNeeds.slice(0, 3).map((need) => (
              <div key={need.id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold text-text-strong">{need.title}</span>
                  <span className="shrink-0 text-brand-2">UGX {need.raisedAmount.toLocaleString()}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full bg-brand" style={{ width: `${Math.min(100, need.raisedAmount / need.targetAmount * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{need.story}</p>
              </div>
            ))}
            {!supportNeeds.length ? (
              <div>
                {athlete.impactNeeds.map((need) => <p key={need} className="mb-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-muted">{need}</p>)}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-text-strong">Season history</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="text-xs uppercase text-subtle"><tr><th className="pb-2">Season</th><th className="pb-2">Competition</th><th className="pb-2">Appearances</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {seasons.filter((season) => season.leagueId === athlete.leagueId).map((season) => (
                <tr key={season.id} className="border-t border-border">
                  <td className="py-3 font-semibold text-text-strong">{season.name}</td>
                  <td className="py-3 text-muted">{league?.name}</td>
                  <td className="py-3 text-muted">{athlete.stats.appearances ?? athlete.stats.matches ?? officialMatches.length}</td>
                  <td className="py-3 capitalize text-verified">{season.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ShareAthleteCard
        open={sharing}
        onClose={() => setSharing(false)}
        athlete={athlete}
        team={team}
        league={league}
      />
    </div>
  );
}

function ShareAthleteCard({
  open,
  onClose,
  athlete,
  team,
  league,
}: {
  open: boolean;
  onClose: () => void;
  athlete: Athlete;
  team?: Team;
  league?: League;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;

  async function download() {
    const url = `${window.location.origin}/athletes/${athlete.id}`;
    const qrUrl = await QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#05070a', light: '#ffffff' } });
    const qr = new Image();
    qr.src = qrUrl;
    await qr.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, '#07110d');
    gradient.addColorStop(0.55, '#008f4c');
    gradient.addColorStop(1, '#05070a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1080, 1350);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fillRect(56, 56, 968, 1238);
    context.fillStyle = '#4dffb3';
    context.font = '700 34px sans-serif';
    context.fillText('GOALPLACE256 / VERIFIED CAREER', 96, 135);
    context.fillStyle = '#ffffff';
    context.font = '700 82px sans-serif';
    wrapText(context, athlete.name, 96, 280, 850, 92);
    context.font = '500 38px sans-serif';
    context.fillStyle = '#dbe3ec';
    context.fillText(`${athlete.position} / ${team?.name ?? athlete.city}`, 96, 470);
    context.font = '700 54px monospace';
    context.fillStyle = '#ffffff';
    context.fillText(`${athlete.stats.appearances ?? 0} APPS`, 96, 650);
    context.fillText(`${athlete.goalPlacePoints} GP`, 96, 735);
    context.font = '500 30px sans-serif';
    context.fillStyle = '#dbe3ec';
    context.fillText(league?.name ?? 'Verified grassroots athlete', 96, 860);
    context.drawImage(qr, 748, 1010, 220, 220);
    context.fillStyle = '#ffffff';
    context.font = '700 34px sans-serif';
    context.fillText('Scan the verified profile', 96, 1120);
    context.font = '500 26px sans-serif';
    context.fillStyle = '#94a3b8';
    context.fillText('Official statistics only. Support never changes rank.', 96, 1175);

    const link = document.createElement('a');
    link.download = `${athlete.name.toLowerCase().replace(/\s+/g, '-')}-goalplace256.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (userId) {
      await provider.recordPointsAction({
        userId,
        actionType: 'athlete_card_shared',
        relatedEntityId: athlete.id,
      }).catch(() => undefined);
    }
    toast.success('Share card downloaded.');
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share verified athlete card"
      description="A social-ready card with a QR link to this career passport."
      footer={<Button block icon={DownloadSimple} onClick={download}>Download card</Button>}
    >
      <div className="rounded-[var(--radius-lg)] bg-[var(--grad-pitch)] p-5 text-white">
        <p className="text-xs font-semibold text-white/75">GOALPLACE256 / VERIFIED CAREER</p>
        <h3 className="mt-8 text-3xl font-bold text-white">{athlete.name}</h3>
        <p className="mt-2 text-sm text-white/80">{athlete.position} / {team?.name}</p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <div><p className="text-2xl font-bold">{athlete.stats.appearances ?? 0}</p><p className="text-xs text-white/70">Official apps</p></div>
          <div><p className="text-2xl font-bold">{athlete.goalPlacePoints}</p><p className="text-xs text-white/70">GoalPlace Points</p></div>
        </div>
      </div>
    </Sheet>
  );
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const candidate = `${line}${word} `;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line.trim(), x, cursorY);
      line = `${word} `;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  context.fillText(line.trim(), x, cursorY);
}
