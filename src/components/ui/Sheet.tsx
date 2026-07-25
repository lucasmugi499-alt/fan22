'use client';

import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * A sheet: bottom sheet on mobile, centered dialog on desktop. Used for actions and forms.
 * Distinct from navigation and workspace tabs. Backdrop closes; Escape closes; body scroll
 * locks while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 motion-safe:animate-[fadeIn_var(--dur-micro)_ease-out]"
      />
      <div
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius-2xl)] border border-border bg-surface-1 bezel-core shadow-e3 pb-safe',
          'motion-safe:animate-[sheetUp_var(--dur-drawer)_var(--ease-fluid)]',
          'sm:m-4 sm:max-w-md sm:rounded-[var(--radius-2xl)]'
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-strong">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text-strong"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
