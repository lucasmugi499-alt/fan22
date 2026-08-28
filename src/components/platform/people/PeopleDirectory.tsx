'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Prohibit, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
  StatusChip,
} from '@/components/platform/PlatformAdminPrimitives';
import type { AccountClass, User } from '@/types';

const inputClass = 'h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand';

function statusTone(status?: User['accountStatus']) {
  if (status === 'active') return 'good';
  if (status === 'suspended' || status === 'disabled' || status === 'deletion_pending') return 'bad';
  if (status === 'invited') return 'warn';
  return 'neutral';
}

export function PeopleDirectory() {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { users, teamAssignments, loading, retry } = useGoalPlaceData({
    collections: ['users', 'teamAssignments'],
    recordLimit: 700,
  });
  const [query, setQuery] = useState('');
  const [accountClass, setAccountClass] = useState<'all' | AccountClass>('all');
  const [savingUserId, setSavingUserId] = useState('');
  const [actionReason, setActionReason] = useState('');

  const filtered = useMemo(() => users.filter((user) => {
    const haystack = `${user.displayName} ${user.name ?? ''} ${user.email} ${user.role} ${user.accountClass ?? ''}`.toLowerCase();
    const matchesSearch = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesClass = accountClass === 'all' || user.accountClass === accountClass;
    return matchesSearch && matchesClass;
  }).sort((left, right) => +new Date(right.createdAt ?? 0) - +new Date(left.createdAt ?? 0)), [accountClass, query, users]);

  async function setAccountStatus(user: User, accountStatus: NonNullable<User['accountStatus']>) {
    const reason = actionReason.trim();
    if (reason.length < 4) {
      toast.error('Add an audit reason before changing an account lifecycle state.');
      return;
    }
    setSavingUserId(user.id);
    try {
      await provider.updateUserProfile(user.id, {
        accountStatus,
        status: accountStatus === 'active' ? 'active' : accountStatus === 'invited' ? 'pending' : 'suspended',
        platformActionReason: reason,
      });
      toast.success(`Account ${accountStatus.replace(/_/g, ' ')}.`);
      setActionReason('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Account status could not be updated.');
    } finally {
      setSavingUserId('');
    }
  }

  if (loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="People"
        description="Search platform accounts by class, review operational status, and perform audited account lifecycle actions."
      />

      <PlatformStatGrid items={[
        { label: 'Fan accounts', value: users.filter((item) => item.accountClass === 'fan' || item.role === 'fan').length },
        { label: 'Athlete accounts', value: users.filter((item) => item.accountClass === 'athlete' || item.role === 'athlete').length },
        { label: 'Org operators', value: users.filter((item) => item.accountClass === 'organization_operator').length },
        { label: 'Restricted', value: users.filter((item) => ['suspended', 'disabled', 'deletion_pending'].includes(item.accountStatus ?? '')).length, tone: 'bad' },
      ]} />

      <Card className="p-4">
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <PlatformSearch value={query} onChange={setQuery} placeholder="Search people by name, email, class or role" />
          <select value={accountClass} onChange={(event) => setAccountClass(event.target.value as 'all' | AccountClass)} className={inputClass} aria-label="Account class filter">
            <option value="all">All account classes</option>
            <option value="fan">Fan</option>
            <option value="athlete">Athlete</option>
            <option value="organization_operator">Organization operator</option>
            <option value="platform_operator">Platform operator</option>
          </select>
        </div>
        <label className="mb-4 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Audit reason for account actions</span>
          <textarea
            value={actionReason}
            onChange={(event) => setActionReason(event.target.value)}
            className="mt-2 min-h-20 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand"
            placeholder="Example: Repeated failed identity checks; suspend pending owner review."
          />
        </label>

        <div className="space-y-2.5">
          {filtered.length ? filtered.slice(0, 80).map((user) => {
            const accountStatus = user.accountStatus ?? 'active';
            const assignments = teamAssignments.filter((assignment) => assignment.userId === user.id);
            return (
              <div key={user.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <DirectoryRow
                  href={`/admin/network/people/${encodeURIComponent(user.id)}`}
                  title={user.displayName || user.name || user.email}
                  meta={`${user.email} · ${user.accountClass ?? 'legacy account'} · ${user.role.replace(/_/g, ' ')}`}
                  status={accountStatus}
                  statusTone={statusTone(accountStatus)}
                  detail={
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip label={user.onboardingStatus ?? user.status} />
                      <StatusChip label={`${assignments.length} team assignment${assignments.length === 1 ? '' : 's'}`} />
                      {user.personId ? <StatusChip label="person linked" tone="good" /> : null}
                    </div>
                  }
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={CheckCircle} onClick={() => setAccountStatus(user, 'active')} disabled={savingUserId === user.id || accountStatus === 'active'}>
                    Activate
                  </Button>
                  <Button size="sm" variant="secondary" icon={Warning} onClick={() => setAccountStatus(user, 'suspended')} disabled={savingUserId === user.id || accountStatus === 'suspended'}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="danger" icon={Prohibit} onClick={() => setAccountStatus(user, 'disabled')} disabled={savingUserId === user.id || accountStatus === 'disabled'}>
                    Disable
                  </Button>
                </div>
              </div>
            );
          }) : (
            <EmptyState title="No people match this filter">Adjust the search or account-class filter.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
