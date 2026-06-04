import React, { useState } from 'react';
import { Trophy, Users, Shield, MapPin } from 'lucide-react';

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

  if (error || !src) {
    const getGradient = () => {
      switch (sport?.toLowerCase()) {
        case 'football': return 'from-emerald-900 to-green-950';
        case 'basketball': return 'from-orange-900 to-amber-950';
        case 'rugby': return 'from-blue-900 to-indigo-950';
        default: return 'from-primary/20 to-background';
      }
    };

    return (
      <div className={`flex items-center justify-center bg-gradient-to-br ${getGradient()} ${className}`}>
        {fallbackType === 'athlete' && (
          <span className="text-xl font-bold text-white/70 tracking-widest">{initials || <Trophy className="w-8 h-8 text-white/50" />}</span>
        )}
        {fallbackType === 'team' && (
          <span className="text-xl font-bold text-white/70 tracking-widest">{initials || <Users className="w-8 h-8 text-white/50" />}</span>
        )}
        {(fallbackType === 'sport' || fallbackType === 'stadium') && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background/80 to-background/90" />
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
