'use client';

import { CommandDialog } from '@/components/platform/commands/CommandDialog';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';

/**
 * Archive, restore, suspend and activate — one dialog for leagues, teams and athletes.
 *
 * The wording is shared on purpose. These four commands mean the same thing whatever they
 * are pointed at, and an operator who learns that "archive keeps everything" on the league
 * page should not have to re-learn it on the athlete page. Divergent copy across three
 * surfaces is how "delete" quietly comes to mean two different things.
 */

export type LifecycleTarget = {
  kind: 'league' | 'team' | 'athlete';
  id: string;
  name: string;
  action: 'activate' | 'suspend' | 'archive' | 'restore';
};

const DESCRIPTION: Record<LifecycleTarget['action'], string> = {
  archive:
    'Archiving hides this from the public and keeps every record attached to it — results, athletes, payments and the audit trail. Nothing is destroyed, and it can be restored.',
  restore:
    'Restoring returns this to suspended rather than straight to public. Archiving is usually a response to something being wrong, so someone should look before it is visible again.',
  suspend:
    'Suspending takes this out of public view while leaving it operational. Use it while something is being checked.',
  activate:
    'Activating makes this publicly visible. For a draft, it is also the point after which it can only be archived, never deleted.',
};

export function LifecycleCommandDialog({
  target,
  onClose,
  onDone,
}: {
  target: LifecycleTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const command = usePlatformCommand('/api/platform/network');

  const label = target ? `${target.action[0].toUpperCase()}${target.action.slice(1)}` : 'Confirm';

  return (
    <CommandDialog
      open={Boolean(target)}
      title={target ? `${label} ${target.name}` : ''}
      description={target ? DESCRIPTION[target.action] : ''}
      submitLabel={label}
      destructive={target?.action === 'archive'}
      // Typing the name is the only moment an operator is forced to confirm they are looking
      // at the object they think they are — archive's effect is invisible on the row that
      // triggered it.
      confirmPhrase={target?.action === 'archive' ? target.name : undefined}
      running={command.running}
      error={command.error}
      onClose={() => { onClose(); command.reset(); }}
      onSubmit={async (_values, reason) => {
        if (!target) return;
        const ok = await command.run({
          command: 'lifecycle',
          reason,
          kind: target.kind,
          id: target.id,
          action: target.action,
        }, `${target.name}: ${target.action} recorded.`);
        if (ok) { onClose(); onDone(); }
      }}
    />
  );
}
