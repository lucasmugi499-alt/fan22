import { describe, expect, it } from 'vitest';
import type { League } from '@/types';
import { pendingApprovals } from './platformContext';

describe('pendingApprovals', () => {
  it('does not show draft leagues that are already in application onboarding', () => {
    const items = pendingApprovals([
      {
        id: 'league_from_application',
        name: 'Application League',
        status: 'draft',
        lifecycleStatus: 'application_approved',
        city: 'Kampala',
      },
      {
        id: 'league_manual_draft',
        name: 'Manual Draft League',
        status: 'draft',
        city: 'Jinja',
      },
    ] as League[], []);

    expect(items.map((item) => item.id)).toEqual(['league_manual_draft']);
  });
});
