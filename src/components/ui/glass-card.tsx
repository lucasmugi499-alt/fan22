import React from 'react';
import { cn } from '@/lib/utils';
import { SportSlug, SportType } from '@/types';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
}

export function GlassCard({ children, className, glow = false, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-panel relative overflow-hidden rounded-xl",
        glow && "shadow-[0_0_32px_rgba(0,196,106,0.16)]",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      <div className="relative z-10 h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function BentoCard({ children, className, ...props }: GlassCardProps) {
  return (
    <GlassCard className={cn("p-6 md:p-8 flex flex-col transition-all hover:bg-white/5", className)} {...props}>
      {children}
    </GlassCard>
  );
}

export function GlowCard({ children, className, color = "var(--goal-emerald)", ...props }: GlassCardProps & { color?: string }) {
  return (
    <div className={cn("relative group", className)} {...props}>
      <div 
        className="absolute -inset-0.5 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500" 
        style={{ backgroundColor: color }} 
      />
      <GlassCard className="h-full relative bg-[#05070A]/80">
        {children}
      </GlassCard>
    </div>
  );
}

export function SportSignalCard({ children, sport, className, ...props }: GlassCardProps & { sport: SportSlug | SportType }) {
  const slug = sport.toLowerCase() as SportSlug;
  return (
    <GlassCard
      className={cn(
        "signal-card",
        slug === 'football' && "sport-edge-football",
        slug === 'basketball' && "sport-edge-basketball",
        slug === 'rugby' && "sport-edge-rugby",
        className
      )}
      {...props}
    >
      {children}
    </GlassCard>
  );
}
