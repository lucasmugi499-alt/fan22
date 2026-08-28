'use client';

import { useId } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { platformCommand } from '@/lib/platform/commandRegistry';

type Props = Omit<ButtonProps, 'variant' | 'children'> & {
  commandId: string;
  label?: string;
  shortcut?: string;
  running?: boolean;
  disabledReason?: string | null;
};

export function PlatformCommandButton({
  commandId,
  label,
  shortcut,
  running = false,
  disabledReason,
  disabled,
  ...buttonProps
}: Props) {
  const reasonId = useId();
  const command = platformCommand(commandId);
  if (!command) return null;
  const blocked = disabled || Boolean(disabledReason);
  const variant = command.tier === 'governed'
    ? 'commandGoverned'
    : command.tier === 'consequential'
      ? 'commandConsequential'
      : command.tier === 'quiet' ? 'quiet' : 'command';

  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <Button
        {...buttonProps}
        variant={variant}
        disabled={blocked || running}
        aria-describedby={disabledReason ? reasonId : undefined}
        aria-busy={running || undefined}
      >
        {running ? 'Working…' : (label ?? command.label)}
        {shortcut ? <kbd className="ml-1 hidden font-mono text-[10px] opacity-65 sm:inline">{shortcut}</kbd> : null}
      </Button>
      {disabledReason ? (
        <span id={reasonId} className="inline-flex max-w-72 items-start gap-1 text-xs leading-5 text-subtle">
          <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
