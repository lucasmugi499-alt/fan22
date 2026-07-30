'use client';

import { useState } from 'react';
import { Check, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { FollowTargetType } from '@/data/providers/types';
import { useAuth } from '@/context/AuthProvider';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { cn } from '@/lib/utils';
import { followProfileField, nextFollowIds } from './followState';

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
  const { userProfile, updateLocalProfile, isDemoMode } = useAuth();
  const { requireAuth } = useAuthGate();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const field = followProfileField(targetType);
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const following = optimisticFollowing ?? (userProfile?.[field]?.includes(targetId) ?? false);

  function toggle() {
    requireAuth(async () => {
      if (saving) return;
      if (!userProfile) {
        toast.error(`Sign in to follow this ${targetType}.`);
        return;
      }
      const next = !following;
      setOptimisticFollowing(next);
      setSaving(true);
      updateLocalProfile({ [field]: nextFollowIds(userProfile, field, targetId, next) });

      try {
        const result = await provider.toggleFollow(userProfile.id, targetType, targetId);
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
      {saving ? 'Saving...' : following ? 'Following' : label ?? `Follow ${targetType}`}
    </button>
  );
}
