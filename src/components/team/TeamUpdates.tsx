'use client';

import { useMemo, useState } from 'react';
import { Camera, Check, Megaphone, PlusCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam } from '@/lib/team/teamContext';
import { FeedPostCard } from '@/components/core/FeedPostCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { uploadPublishedMedia } from '@/lib/firebase/storage';
import { useTeamConsoleAccess } from '@/lib/team/useTeamConsoleAccess';

export function TeamUpdates() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext), [userProfile, catalog.teams, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['feedPosts'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 50,
  });
  // Capability, not role. A `team_admin` claim grants nothing since ADR-004, and a control
  // rendered on the strength of the claim is one the server will refuse.
  const access = useTeamConsoleAccess(team?.id);
  const { feedPosts, retry } = detail;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<File>();

  const posts = useMemo(() => {
    if (!team) return [];
    return feedPosts
      .filter((p) => p.relatedTeamId === team.id || p.authorId === team.id)
      .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0));
  }, [team, feedPosts]);

  async function publish() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!team || !actorUserId || !caption.trim()) {
      toast.error('Add an update before publishing.');
      return;
    }
    setSaving(true);
    try {
      const mediaUrl = media
        ? isDemoMode
          ? URL.createObjectURL(media)
          : await uploadPublishedMedia({
              ownerType: 'team',
              ownerId: team.id,
              userId: actorUserId,
              file: media,
            })
        : undefined;
      await provider.createFeedPost({
        authorId: actorUserId,
        authorName: team.name,
        authorRole: 'team',
        authorType: 'Team',
        sport: team.sport,
        type: 'team_update',
        caption: caption.trim(),
        mediaUrl,
        mediaType: media?.type.startsWith('video/') ? 'video' : media ? 'image' : undefined,
        relatedTeamId: team.id,
        relatedLeagueId: team.leagueId,
        verified: team.verified,
      });
      setCaption('');
      setMedia(undefined);
      setPublishing(false);
      retry();
      toast.success('Team update published.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The update could not be published.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Updates</h1>
          <p className="text-sm text-muted">News, highlights and announcements from your team.</p>
        </div>
        {access.canManage ? (
          <Button size="sm" icon={PlusCircle} onClick={() => setPublishing(true)}>
            Publish
          </Button>
        ) : null}
      </div>

      {posts.length ? (
        <div className="-mx-[var(--gutter)] md:mx-0 md:space-y-3">
          {posts.map((p) => (
            <FeedPostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title="No updates yet"
          description={access.canManage
            ? 'Share match previews, results and athlete highlights here. Your supporters see them in their feed.'
            : 'Your league publishes updates for this club.'}
          action={access.canManage
            ? <Button size="sm" icon={PlusCircle} onClick={() => setPublishing(true)}>Publish your first update</Button>
            : undefined}
        />
      )}

      <Sheet
        open={publishing}
        onClose={() => setPublishing(false)}
        title="Publish team update"
        description="Followers will see this in their sports feed."
        footer={<Button block icon={Check} onClick={publish} disabled={saving}>{saving ? 'Publishing...' : 'Publish update'}</Button>}
      >
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase text-subtle">Update<textarea className="field mt-2 min-h-32 py-3 normal-case" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Match preview, result, roster news, or development update." /></label>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-2 p-4 text-center">
            <Camera className="h-7 w-7 text-brand" weight="duotone" />
            <span className="mt-2 text-sm font-semibold text-text-strong">{media?.name ?? 'Add photo or video'}</span>
            <span className="text-xs text-muted">Optional, up to 15 MB.</span>
            <input className="sr-only" type="file" accept="image/*,video/*" onChange={(event) => setMedia(event.target.files?.[0])} />
          </label>
        </div>
      </Sheet>
    </div>
  );
}
