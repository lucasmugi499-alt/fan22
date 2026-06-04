'use client';

import React from 'react';
import { MobileNav, DesktopNav } from './Navigation';

import { ReactLenis } from 'lenis/react';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root>
      <div className="flex flex-col min-h-screen bg-background text-foreground pb-16 md:pb-0 selection:bg-primary/30">
        <DesktopNav />
        <main className="flex-1 flex flex-col relative">
          {children}
        </main>
        <MobileNav />
      </div>
    </ReactLenis>
  );
}
