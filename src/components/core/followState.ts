import type { FollowTargetType } from '@/data/providers/types';
import type { UserProfile } from '@/types';

export type FollowProfileField =
  | 'followedAthletes'
  | 'followedTeams'
  | 'followedLeagues';

export function followProfileField(targetType: FollowTargetType): FollowProfileField {
  if (targetType === 'athlete') return 'followedAthletes';
  if (targetType === 'team') return 'followedTeams';
  return 'followedLeagues';
}

export function nextFollowIds(
  profile: Pick<UserProfile, FollowProfileField>,
  field: FollowProfileField,
  targetId: string,
  following: boolean,
) {
  const next = new Set(profile[field] ?? []);
  if (following) next.add(targetId);
  else next.delete(targetId);
  return [...next];
}
