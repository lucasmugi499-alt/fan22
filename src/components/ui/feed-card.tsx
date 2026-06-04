import React from 'react';
import { FeedPost } from '@/lib/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Heart, MessageSquare, Share2, Award, Bookmark, ShieldCheck } from 'lucide-react';
import { mockAthletes, mockTeams } from '@/lib/mockData';
import { ImageWithFallback } from './image-with-fallback';

export function FeedCard({ post }: { post: FeedPost }) {
  let authorName = 'Unknown';
  let authorAvatar = '';
  
  if (post.authorType === 'Athlete') {
    const a = mockAthletes.find(a => a.id === post.authorId);
    if (a) { authorName = a.name; authorAvatar = a.avatarUrl; }
  } else if (post.authorType === 'Team') {
    const t = mockTeams.find(t => t.id === post.authorId);
    if (t) { authorName = t.name; authorAvatar = t.logoUrl; }
  }

  // Format timestamp (mocked time ago)
  const timeSince = "2h ago"; 

  return (
    <GlassCard className="p-0 overflow-hidden mb-6 hover:shadow-[0_0_25px_rgba(16,185,129,0.1)] transition-shadow duration-300">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-500/20 shadow-lg relative">
              <ImageWithFallback 
                src={authorAvatar} 
                alt={authorName}
                fallbackType={post.authorType === 'Athlete' ? 'athlete' : 'team'}
                initials={authorName.slice(0, 2).toUpperCase()}
                sport={post.sport}
                className="w-full h-full object-cover" 
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-base hover:text-emerald-400 cursor-pointer transition-colors">{authorName}</h4>
                {post.verified && <VerificationBadge />}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground/80">{post.authorType}</span>
                <span>•</span>
                <span className="bg-white/5 px-2 py-0.5 rounded-full border border-white/5">{post.sport}</span>
                <span>•</span>
                <span>{timeSince}</span>
              </div>
            </div>
          </div>
          {post.type === 'VerifiedAchievement' && (
             <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-full border border-emerald-500/20" title="Verified Achievement">
               <ShieldCheck className="w-5 h-5" />
             </div>
          )}
        </div>

        <p className="text-[15px] mb-4 leading-relaxed text-foreground/90">{post.caption}</p>

        {post.statsRow && post.statsRow.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.statsRow.map((stat, idx) => (
              <span key={idx} className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-md font-bold uppercase tracking-wide">
                {stat}
              </span>
            ))}
          </div>
        )}
      </div>

      {post.mediaUrl && (
        <div className="w-full aspect-video bg-black relative border-y border-white/5">
          <ImageWithFallback 
            src={post.mediaUrl} 
            alt="Post media" 
            fallbackType="stadium"
            sport={post.sport}
            className="w-full h-full object-cover" 
          />
        </div>
      )}

      <div className="px-5 py-4 flex justify-between items-center text-muted-foreground bg-white/[0.02]">
        <div className="flex gap-6">
          <button className="flex items-center gap-2 text-sm hover:text-emerald-400 transition-colors group">
            <div className="p-2 rounded-full group-hover:bg-emerald-500/10 transition-colors">
              <Heart className="w-4 h-4" />
            </div>
            <span className="font-medium">{post.likes}</span>
          </button>
          <button className="flex items-center gap-2 text-sm hover:text-foreground transition-colors group">
            <div className="p-2 rounded-full group-hover:bg-white/5 transition-colors">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-medium">{post.comments}</span>
          </button>
          <button className="flex items-center gap-2 text-sm hover:text-foreground transition-colors group">
            <div className="p-2 rounded-full group-hover:bg-white/5 transition-colors">
              <Share2 className="w-4 h-4" />
            </div>
            <span className="font-medium">{post.shares}</span>
          </button>
        </div>
        <button className="p-2 rounded-full hover:bg-white/5 hover:text-foreground transition-colors">
          <Bookmark className="w-4 h-4" />
        </button>
      </div>
    </GlassCard>
  );
}
