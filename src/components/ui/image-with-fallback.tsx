'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { Image01Icon, SecurityCheckIcon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { getSportTheme } from '@/lib/sportThemes';
import { cn } from '@/lib/utils';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackType?: 'athlete' | 'team' | 'sport' | 'stadium';
  initials?: string;
  sport?: string;
}

export function ImageWithFallback({ 
  src, 
  alt, 
  fallbackType = 'stadium',
  initials,
  sport,
  className,
  ...props 
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false);
  const theme = getSportTheme(sport);
  const Icon = fallbackType === 'team' ? Users : fallbackType === 'athlete' ? Trophy : fallbackType === 'sport' ? theme.icon : SecurityCheckIcon;

  if (error || !src) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden bg-gradient-to-br',
          theme.mutedGradient,
          className
        )}
        aria-label={alt}
        role="img"
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.12),transparent_32%,rgba(255,255,255,0.06)_64%,transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
        {fallbackType === 'athlete' || fallbackType === 'team' ? (
          <span className="relative z-10 rounded-lg border border-white/12 bg-black/24 px-2.5 py-1.5 text-base font-black tracking-widest text-white/82 shadow-xl backdrop-blur-sm">
            {initials || <Icon className="size-6 text-white/60" />}
          </span>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-2 text-white/70">
            {fallbackType === 'stadium' ? <Image01Icon className="size-8" /> : <Icon className="size-8" />}
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">{theme.name}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      className={className}
      {...props}
    />
  );
}
