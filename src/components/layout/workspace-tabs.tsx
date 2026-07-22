'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Horizontally scrollable workspace tabs.
 *
 * Answers "which part of this workspace am I in?" — distinct from global navigation
 * ("where am I going?") and from action buttons ("what am I doing?"). Keeping those three
 * separate is what stops the same destination appearing three times on one screen.
 *
 * Behaviour the previous tab strip lacked: 44px minimum targets (it was 40px), scroll
 * snapping, an edge fade indicating more tabs exist, and auto-scrolling the active tab into
 * view — without which a deep-linked tab can be active but off-screen.
 */

export type WorkspaceTab = {
  id: string;
  label: string;
  /** Optional count, e.g. items awaiting action. Draws the eye to work that needs doing. */
  badge?: number;
};

export function WorkspaceTabs({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: WorkspaceTab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // A deep link can land on a tab that is scrolled out of view; bring it into view so the
  // active state is actually visible.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <div className={cn('relative -mx-5 md:mx-0', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Workspace sections"
        className="hide-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth px-5 md:px-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex min-h-[var(--tap-min)] shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/60',
                isActive
                  ? 'text-white'
                  : 'text-[var(--text-3)] hover:bg-[var(--surface-interactive)] hover:text-[var(--text-2)]'
              )}
            >
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className="rounded-full bg-[var(--state-pending-bg)] px-1.5 py-0.5 text-[10px] font-black text-[var(--state-pending)]"
                  aria-label={`${tab.badge} awaiting action`}
                >
                  {tab.badge}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="workspace-tab-underline"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--brand-primary)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Edge fades: the only cue that the strip scrolls. Non-interactive. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[var(--bg-base)] to-transparent md:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--bg-base)] to-transparent md:hidden" />
      <div className="absolute inset-x-5 bottom-0 h-px bg-white/8 md:inset-x-0" />
    </div>
  );
}

/**
 * Contextual actions for the current tab.
 *
 * Deliberately separate from the tab strip: tabs change what you are looking at, these
 * change something. On mobile the primary action stays reachable near the thumb rather
 * than stranded at the top of the page.
 */
export function ContextualActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Actions for this section"
      className={cn(
        'hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0',
        className
      )}
    >
      {children}
    </div>
  );
}
