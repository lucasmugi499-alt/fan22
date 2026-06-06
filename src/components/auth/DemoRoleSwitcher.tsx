'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { AppRole } from '@/types';
import { Shield, ChevronUp, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLES: { id: AppRole; label: string }[] = [
  { id: 'fan', label: 'Fan' },
  { id: 'athlete', label: 'Athlete' },
  { id: 'team_admin', label: 'Team Admin' },
  { id: 'league_admin', label: 'League Admin' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'platform_admin', label: 'Admin' },
  { id: 'super_admin', label: 'Super Admin' },
];

export function DemoRoleSwitcher() {
  const { setDemoRole, role, isDemoMode, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // In production, we would probably hide this entirely
  if (process.env.NODE_ENV === 'production' && !isDemoMode) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 z-[999] sm:bottom-4">
      <div className={cn(
        "absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0A0D14]/95 shadow-2xl backdrop-blur-xl transition-all duration-200",
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}>
        <div className="border-b border-white/10 p-2">
          <p className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Demo Mode</p>
        </div>
        <div className="flex flex-col p-1">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setDemoRole(r.id);
                setIsOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                role === r.id 
                  ? "bg-[var(--goal-emerald)]/10 font-bold text-[var(--goal-mint)]"
                  : "text-slate-300 hover:bg-white/5"
              )}
            >
              <User className="size-4" />
              {r.label}
            </button>
          ))}
          <div className="my-1 h-px bg-white/10" />
          <button
            onClick={async () => {
              if (isDemoMode) {
                setDemoRole(null);
              } else {
                await logout();
              }
              setIsOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold shadow-xl transition-all",
          isDemoMode 
            ? "border-[var(--goal-emerald)]/50 bg-[var(--goal-emerald)]/20 text-[var(--goal-mint)] hover:bg-[var(--goal-emerald)]/30"
            : "border-white/10 bg-[#0A0D14]/80 text-white hover:bg-white/10"
        )}
      >
        <Shield className="size-4" />
        {isDemoMode ? `Demo: ${role}` : "Demo Roles"}
        <ChevronUp className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
    </div>
  );
}
