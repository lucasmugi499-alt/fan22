'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

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
  mobileFullScreen = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mobileFullScreen?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;

    // Remember what had focus so it can be handed back on close, and move focus into the
    // sheet so keyboard and screen-reader users are not left behind on the page below.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Contain Tab within the sheet: a dialog you can tab out of is not really modal.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 motion-safe:animate-[fadeIn_var(--dur-micro)_ease-out]"
      />
      <div
        ref={panelRef}
        className={cn(
          'relative flex max-h-[calc(100dvh-12px)] w-full min-w-0 flex-col overflow-hidden rounded-t-[var(--radius-2xl)] border border-border bg-surface-1 bezel-core shadow-e3 pb-safe',
          'motion-safe:animate-[sheetUp_var(--dur-drawer)_var(--ease-fluid)]',
          mobileFullScreen && 'h-dvh max-h-dvh rounded-none border-x-0 border-b-0 sm:h-auto sm:max-h-[calc(100dvh-32px)]',
          'sm:m-4 sm:max-w-md sm:rounded-[var(--radius-2xl)]'
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-text-strong">{title}</h2>
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

        {footer ? <div className="shrink-0 border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
