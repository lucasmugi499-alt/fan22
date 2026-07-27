'use client';

import { useState } from 'react';
import { Camera, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { uploadPublishedMedia } from '@/lib/firebase/storage';
import type { Athlete, Match, SupportNeed } from '@/types';

export type AthleteManageMode = 'profile' | 'support' | 'challenge' | 'highlight';

export function AthleteManageSheet({
  athlete,
  matches,
  mode,
  onClose,
  onSaved,
}: {
  athlete: Athlete;
  matches: Match[];
  mode: AthleteManageMode | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const actorUserId = currentUser?.uid ?? userProfile?.uid;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(athlete.name);
  const [city, setCity] = useState(athlete.city);
  const [bio, setBio] = useState(athlete.bio);
  const [impactNeeds, setImpactNeeds] = useState(athlete.impactNeeds.join(', '));
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [targetAmount, setTargetAmount] = useState('300000');
  const [payoutDestination, setPayoutDestination] = useState<SupportNeed['preferredPayoutDestination']>('approved_vendor');
  const [challengeCategory, setChallengeCategory] = useState('development');
  const [challengeTarget, setChallengeTarget] = useState('1');
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<File>();

  if (!mode) return null;

  async function save() {
    if (!actorUserId) {
      toast.error('Your athlete account is not ready.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'profile') {
        await provider.updateAthleteProfile(athlete.id, {
          name: name.trim(),
          city: city.trim(),
          bio: bio.trim(),
          impactNeeds: impactNeeds.split(',').map((item) => item.trim()).filter(Boolean),
          avatarUrl: athlete.avatarUrl,
          coverUrl: athlete.coverUrl,
        });
        toast.success('Your public profile was updated.');
      }
      if (mode === 'support') {
        if (!title.trim() || !story.trim() || Number(targetAmount) <= 0) {
          throw new Error('Add a title, story, and target amount.');
        }
        await provider.createSupportNeed({
          athleteId: athlete.id,
          teamId: athlete.teamId,
          leagueId: athlete.leagueId,
          title: title.trim(),
          story: story.trim(),
          targetAmount: Number(targetAmount),
          status: 'open',
          approvalStatus: 'proposed',
          verificationStatus: 'pending',
          preferredPayoutDestination: payoutDestination,
          payoutDestinationStatus: 'pending_verification',
          recipientIsMinor: athlete.ageGroup === 'U18',
          createdByUserId: actorUserId,
        });
        toast.success('Support need submitted for verification.');
      }
      if (mode === 'challenge') {
        const seasonId = matches.find((item) => item.leagueId === athlete.leagueId)?.seasonId;
        if (!seasonId || !title.trim() || Number(challengeTarget) <= 0) {
          throw new Error('Add a season milestone and a valid target.');
        }
        await provider.createChallenge({
          athleteId: athlete.id,
          leagueId: athlete.leagueId,
          seasonId,
          sport: athlete.sport,
          type: challengeCategory,
          target: Number(challengeTarget),
          description: title.trim(),
          targetDescription: title.trim(),
          totalPledged: 0,
          supportersCount: 0,
          status: 'proposed',
          fundingModel: 'non_cash',
          verificationStatus: 'pending',
          submittedBy: actorUserId,
        });
        toast.success('Challenge proposal sent for review.');
      }
      if (mode === 'highlight') {
        if (!caption.trim()) throw new Error('Add a caption for this highlight.');
        const mediaUrl = media
          ? isDemoMode
            ? URL.createObjectURL(media)
            : await uploadPublishedMedia({
                ownerType: 'athlete',
                ownerId: athlete.id,
                userId: actorUserId,
                file: media,
              })
          : undefined;
        await provider.createFeedPost({
          authorId: actorUserId,
          authorName: athlete.name,
          authorRole: 'athlete',
          authorType: 'Athlete',
          sport: athlete.sport,
          type: 'athlete_highlight',
          caption: caption.trim(),
          mediaUrl,
          mediaType: media?.type.startsWith('video/') ? 'video' : media ? 'image' : undefined,
          relatedAthleteId: athlete.id,
          relatedTeamId: athlete.teamId,
          relatedLeagueId: athlete.leagueId,
          verified: false,
        });
        toast.success('Highlight published.');
      }
      onSaved();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This update could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const content = {
    profile: {
      title: 'Edit athlete profile',
      description: 'You control this public story. Official statistics remain locked.',
      label: 'Save profile',
    },
    support: {
      title: 'Create a support need',
      description: 'Explain the need and what a completed contribution enables.',
      label: 'Submit need',
    },
    challenge: {
      title: 'Propose a challenge',
      description: 'Propose a season or development milestone. Pilot challenges are non-cash until legal clearance.',
      label: 'Submit proposal',
    },
    highlight: {
      title: 'Publish a highlight',
      description: 'Share a career update with followers.',
      label: 'Publish highlight',
    },
  }[mode];

  return (
    <Sheet
      open
      onClose={onClose}
      title={content.title}
      description={content.description}
      footer={<Button block icon={Check} onClick={save} disabled={saving}>{saving ? 'Saving...' : content.label}</Button>}
    >
      {mode === 'profile' ? (
        <div className="space-y-4">
          <Field label="Name"><input className="field" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="City"><input className="field" value={city} onChange={(event) => setCity(event.target.value)} /></Field>
          <Field label="Bio"><textarea className="field min-h-28 py-3" value={bio} onChange={(event) => setBio(event.target.value)} /></Field>
          <Field label="Development needs"><input className="field" value={impactNeeds} onChange={(event) => setImpactNeeds(event.target.value)} placeholder="Boots, transport, nutrition" /></Field>
          <p className="text-xs text-muted">Team, league, verification, support totals, points, and official statistics cannot be edited here.</p>
        </div>
      ) : null}
      {mode === 'support' ? (
        <div className="space-y-4">
          <Field label="Need"><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Transport for away fixtures" /></Field>
          <Field label="Why it matters"><textarea className="field min-h-28 py-3" value={story} onChange={(event) => setStory(event.target.value)} /></Field>
          <Field label="Target, UGX"><input className="field" type="number" min="1000" inputMode="numeric" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} /></Field>
          <Field label="Preferred payment destination">
            <select className="field" value={payoutDestination} onChange={(event) => setPayoutDestination(event.target.value as SupportNeed['preferredPayoutDestination'])}>
              <option value="approved_vendor">Approved vendor</option>
              <option value="verified_team">Verified team</option>
              <option value="verified_academy">Verified academy</option>
              {athlete.ageGroup !== 'U18' ? <option value="adult_athlete">Adult athlete</option> : null}
              {athlete.ageGroup === 'U18' ? <option value="verified_guardian">Verified guardian</option> : null}
              <option value="evidence_reimbursement">Evidence reimbursement</option>
            </select>
          </Field>
          <p className="text-xs text-muted">Vendor and verified organization payment is preferred. No payout occurs until identity, destination, and any guardian consent checks pass.</p>
        </div>
      ) : null}
      {mode === 'challenge' ? (
        <div className="space-y-4">
          <Field label="Category">
            <select className="field" value={challengeCategory} onChange={(event) => setChallengeCategory(event.target.value)}>
              <option value="development">Development</option>
              <option value="education">Education</option>
              <option value="community_impact">Community impact</option>
              <option value="participation">Participation</option>
              <option value="recovery">Recovery</option>
              <option value="season_performance">Season performance</option>
            </select>
          </Field>
          <Field label="Milestone"><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Complete 20 verified training sessions" /></Field>
          <Field label="Target"><input className="field" type="number" min="1" inputMode="numeric" value={challengeTarget} onChange={(event) => setChallengeTarget(event.target.value)} /></Field>
          <p className="text-xs leading-relaxed text-muted">Fans may follow this milestone and earn recognition points. No fan money is pooled and no supporter can profit from the outcome.</p>
        </div>
      ) : null}
      {mode === 'highlight' ? (
        <div className="space-y-4">
          <Field label="Caption"><textarea className="field min-h-28 py-3" value={caption} onChange={(event) => setCaption(event.target.value)} /></Field>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-2 p-4 text-center">
            <Camera className="h-7 w-7 text-brand" weight="duotone" />
            <span className="mt-2 text-sm font-semibold text-text-strong">{media?.name ?? 'Add photo or video'}</span>
            <span className="text-xs text-muted">Optional, up to 15 MB.</span>
            <input className="sr-only" type="file" accept="image/*,video/*" onChange={(event) => setMedia(event.target.files?.[0])} />
          </label>
        </div>
      ) : null}
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase text-subtle">{label}<span className="mt-2 block normal-case">{children}</span></label>;
}
