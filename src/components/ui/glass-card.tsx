import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
}

export function GlassCard({ children, className, glow = false, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10",
        glow && "shadow-[0_0_15px_rgba(16,185,129,0.1)]",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      <div className="relative z-10 p-4">
        {children}
      </div>
    </div>
  );
}
