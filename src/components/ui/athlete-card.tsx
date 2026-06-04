import React from 'react';
import { Athlete } from '@/lib/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Button } from './button';
import { MapPin, Users, Trophy, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from './image-with-fallback';

interface AthleteCardProps {
  athlete: Athlete;
  onSupport?: () => void;
  onView?: () => void;
}

export function AthleteCard({ athlete, onSupport, onView }: AthleteCardProps) {
  const getKeyStat = () => {
    if (!athlete.stats) return null;
    if (athlete.sport === 'Football') return { label: 'Goals', value: athlete.stats['Goals'] };
    if (athlete.sport === 'Basketball') return { label: 'Points/G', value: athlete.stats['Points'] };
    if (athlete.sport === 'Rugby') return { label: 'Tries', value: athlete.stats['Tries'] };
    return null;
  };

  const keyStat = getKeyStat();

  return (
    <GlassCard className="p-0 overflow-hidden group cursor-pointer hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:border-primary/30 transition-all duration-300 flex flex-col h-full" onClick={onView}>
      <div className="h-40 relative overflow-hidden bg-black">
        <ImageWithFallback 
          src={athlete.coverUrl} 
          alt="Cover" 
          fallbackType="stadium"
          sport={athlete.sport}
          className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        
        {/* Badges Overlay */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-md rounded border border-white/10 text-white">
            {athlete.sport}
          </span>
        </div>
      </div>
      
      <div className="px-5 pb-5 -mt-12 relative z-10 flex flex-col flex-1">
        <div className="flex justify-between items-end mb-3">
          <div className="w-20 h-20 rounded-full border-4 border-background overflow-hidden bg-muted relative shadow-xl">
            <ImageWithFallback 
              src={athlete.avatarUrl} 
              alt={athlete.name} 
              fallbackType="athlete"
              initials={athlete.name.split(' ').map(n => n[0]).join('')}
              sport={athlete.sport}
              className="w-full h-full object-cover" 
            />
          </div>
          {athlete.verified && (
            <div className="mb-2">
              <VerificationBadge />
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <h3 className="text-xl font-bold leading-tight mb-1 group-hover:text-primary transition-colors">{athlete.name}</h3>
          <p className="text-sm font-medium text-emerald-400/90">{athlete.position} • {athlete.city}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" /> Supporters
            </div>
            <p className="text-lg font-bold">{athlete.supportersCount}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Trophy className="w-3.5 h-3.5" /> {keyStat ? keyStat.label : 'Rating'}
            </div>
            <p className="text-lg font-bold">{keyStat ? keyStat.value : 'N/A'}</p>
          </div>
        </div>

        <div className="mb-5 p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20">
          <p className="text-[11px] text-emerald-500/80 uppercase tracking-wider font-semibold mb-1">Total Verified Support</p>
          <p className="text-lg font-black text-emerald-400">{athlete.totalEarnings.toLocaleString()} UGX</p>
        </div>

        <div className="w-full flex gap-3 mt-auto">
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all font-bold" onClick={(e) => { e.stopPropagation(); onSupport?.(); }}>
            Support Athlete
          </Button>
          <Button variant="outline" size="icon" className="w-10 shrink-0 border-white/10 hover:bg-white/10" onClick={(e) => { e.stopPropagation(); onView?.(); }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
