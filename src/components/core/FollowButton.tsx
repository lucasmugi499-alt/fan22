'use client';

import { useState } from 'react';
import { Check, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import type { FollowTargetType } from '@/data/providers/types';
import { useAuth } from '@/context/AuthProvider';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { cn } from '@/lib/utils';

function profileField(targetType: FollowTargetType) {
  if (targetType === 'athlete') return 'followedAthletes' as const;
  if (targetType === 'team') return 'followedTeams' as const;
  return 'followedLeagues' as const;
}

export function FollowButton({
  targetType,
  targetId,
  label,
  className,
}: {
  targetType: FollowTargetType;
  targetId: string;
  label?: string;
  className?: string;
}) {
  const { userProfile, updateLocalProfile } = useAuth();
  const { requireAuth } = useAuthGate();
  const field = profileField(targetType);
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const following = optimisticFollowing ?? (userProfile?.[field]?.includes(targetId) ?? false);

  function toggle() {
    requireAuth(async () => {
      if (!userProfile || saving) return;
      const next = !following;
      setOptimisticFollowing(next);
      setSaving(true);
      const current = new Set(userProfile[field] ?? []);
      if (next) current.add(targetId);
      else current.delete(targetId);
      updateLocalProfile({ [field]: [...current] });

      try {
        const result = await dataProvider.toggleFollow(userProfile.id, targetType, targetId);
        setOptimisticFollowing(null);
        toast.success(result.message ?? (next ? 'Follow saved.' : 'Follow removed.'));
      } catch (cause) {
        setOptimisticFollowing(null);
        updateLocalProfile({ [field]: userProfile[field] });
        toast.error(cause instanceof Error ? cause.message : 'Could not update this follow.');
      } finally {
        setSaving(false);
      }
    }, `Sign in to follow this ${targetType}.`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] px-4 text-sm font-semibold backdrop-blur-sm transition-colors disabled:opacity-60',
        following ? 'bg-brand text-on-brand shadow-[var(--glow-brand)]' : 'bg-black/30 text-white hover:bg-black/45',
        className,
      )}
      aria-pressed={following}
    >
      {following
        ? <Check className="h-4 w-4" weight="bold" />
        : <Plus className="h-4 w-4" weight="bold" />}
      {following ? 'Following' : label ?? `Follow ${targetType}`}
    </button>
  );
}
