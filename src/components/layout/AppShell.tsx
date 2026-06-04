'use client';

import React, { useEffect, useState } from 'react';
import { MobileNav, DesktopNav } from './Navigation';

import { ReactLenis } from 'lenis/react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [smoothScroll, setSmoothScroll] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const update = () => setSmoothScroll(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const shell = (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground selection:bg-[var(--goal-emerald)]/30">
      <div className="pointer-events-none fixed inset-0 z-0 stadium-vignette" />
      <div className="pointer-events-none fixed inset-0 z-0 stadium-rays" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <DesktopNav />
        <main className="relative flex flex-1 flex-col">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );

  if (!smoothScroll) {
    return shell;
  }

  return (
    <ReactLenis root options={{ lerp: 0.08, duration: 1.1 }}>
      {shell}
    </ReactLenis>
  );
}
