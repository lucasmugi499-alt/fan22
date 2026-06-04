import React from 'react';
import { FeedPost } from '@/lib/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Heart, MessageSquare, Share2, Award } from 'lucide-react';
import { mockAthletes, mockTeams } from '@/lib/mockData';

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

  const timeSince = "2h ago"; // Mocked time

  return (
    <GlassCard className="p-0 overflow-hidden mb-4">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <img src={authorAvatar} alt={authorName} className="w-10 h-10 rounded-full object-cover border border-white/10" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm">{authorName}</h4>
                {post.verified && <VerificationBadge className="scale-75 origin-left" />}
              </div>
              <p className="text-xs text-muted-foreground">{post.authorType} • {timeSince}</p>
            </div>
          </div>
          {post.type === 'VerifiedAchievement' && (
             <div className="bg-secondary/20 text-secondary p-1.5 rounded-full">
               <Award className="w-4 h-4" />
             </div>
          )}
        </div>

        <p className="text-sm mb-4 leading-relaxed">{post.caption}</p>

        {post.statsRow && post.statsRow.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.statsRow.map((stat, idx) => (
              <span key={idx} className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-md font-semibold">
                {stat}
              </span>
            ))}
          </div>
        )}
      </div>

      {post.mediaUrl && (
        <div className="w-full aspect-video bg-muted relative">
          <img src={post.mediaUrl} alt="Post media" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4 border-t border-white/5 flex justify-between text-muted-foreground">
        <button className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors">
          <Heart className="w-4 h-4" /> {post.likes}
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <MessageSquare className="w-4 h-4" /> {post.comments}
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <Share2 className="w-4 h-4" /> {post.shares}
        </button>
      </div>
    </GlassCard>
  );
}
