import React from 'react';
import { Athlete } from '@/lib/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Button } from './button';
import { MapPin, Users, Trophy } from 'lucide-react';

interface AthleteCardProps {
  athlete: Athlete;
  onSupport?: () => void;
  onView?: () => void;
}

export function AthleteCard({ athlete, onSupport, onView }: AthleteCardProps) {
  return (
    <GlassCard className="p-0 overflow-hidden group cursor-pointer hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all" onClick={onView}>
      <div className="h-32 bg-secondary/20 relative overflow-hidden">
        <img src={athlete.coverUrl} alt="Cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>
      
      <div className="px-4 pb-4 -mt-12 relative z-10 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full border-4 border-background overflow-hidden bg-muted mb-3 relative">
          <img src={athlete.avatarUrl} alt={athlete.name} className="w-full h-full object-cover" />
        </div>
        
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold">{athlete.name}</h3>
          {athlete.verified && <VerificationBadge />}
        </div>
        
        <p className="text-sm text-muted-foreground mb-3">{athlete.position} • {athlete.sport}</p>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {athlete.city}</div>
          <div className="flex items-center gap-1"><Users className="w-3 h-3"/> {athlete.supportersCount} Supporters</div>
        </div>

        <div className="w-full flex justify-between items-center bg-white/5 rounded-lg p-2 mb-4">
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Total Payouts</p>
            <p className="text-sm font-bold text-primary flex items-center gap-1">
              <Trophy className="w-3 h-3" /> {athlete.totalEarnings.toLocaleString()} UGX
            </p>
          </div>
        </div>

        <div className="w-full flex gap-2 mt-auto">
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={(e) => { e.stopPropagation(); onSupport?.(); }}>
            Support
          </Button>
          <Button variant="outline" className="flex-1" onClick={(e) => { e.stopPropagation(); onView?.(); }}>
            Profile
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
