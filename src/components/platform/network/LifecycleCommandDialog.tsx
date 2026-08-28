'use client';

import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
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
    <ConsequenceSheet
      open={Boolean(target)}
      commandId={target ? `network.${target.kind}.${target.action}` : 'network.league.activate'}
      targetId={target?.id}
      inputs={target ? { kind: target.kind, id: target.id, action: target.action } : {}}
      title={target ? `${label} ${target.name}` : ''}
      submitLabel={label}
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
