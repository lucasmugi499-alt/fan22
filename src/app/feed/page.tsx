'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Radio, ShieldCheck, Sparkles } from 'lucide-react';
import { Athlete } from '@/lib/types';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/button';
import { FeedCard } from '@/components/ui/feed-card';
import { CommentsDrawer, CreatePostModal, SupportModal } from '@/components/modals/app-modals';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, StickyFilterBar } from '@/components/ui/product';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Following', 'Highlights', 'Verified', 'Awards'];

export default function FeedPage() {
  const router = useRouter();
  const { athletes, feedPosts } = useGoalPlaceData();
  const [activeFilter, setActiveFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);

  const filteredFeed = useMemo(() => {
    return feedPosts.filter((post) => {
      if (activeFilter === 'All') return true;
      if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return post.sport === activeFilter;
      if (activeFilter === 'Following') return ['a1', 'a3', 'a5', 't1', 't4'].includes(post.authorId);
      if (activeFilter === 'Highlights') return post.type === 'AthleteHighlight';
      if (activeFilter === 'Verified') return post.verified || post.type === 'VerifiedAchievement';
      if (activeFilter === 'Awards') return post.type === 'AnnualAwards';
      return true;
    });
  }, [activeFilter, feedPosts]);

  const findAthlete = (authorId: string) => athletes.find((athlete) => athlete.id === authorId) ?? athletes[0] ?? null;

  return (
    <PageContainer compact className="max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <SectionHeader
            eyebrow="Community Feed"
            title="The Social Heartbeat"
            description="Highlights, results, verified achievements, and community moments from Uganda's grassroots sport."
          />
          <div className="hidden gap-3 lg:grid">
            <ImpactStatCard label="Live conversations" value="326" icon={Radio} detail="Fans, teams, athletes, and leagues active today." />
            <ImpactStatCard label="Verified moments" value="41" icon={ShieldCheck} tone="gold" detail="Confirmed achievements and match updates." />
            <ImpactStatCard label="Community reach" value="24k" icon={Sparkles} tone="blue" detail="Daily GoalPlace256 demo impressions." />
          </div>
        </aside>

        <main className="min-w-0">
          <StickyFilterBar filters={filters} active={activeFilter} onChange={setActiveFilter} />

          <div className="space-y-4">
            {filteredFeed.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                onSupport={() => setSupportAthlete(findAthlete(post.authorId))}
                onComment={() => setCommentsOpen(true)}
                onViewProfile={() => {
                  if (post.authorType === 'Athlete') router.push(`/athletes/${post.authorId}`);
                  else if (post.authorType === 'Team') router.push(`/teams/${post.authorId}`);
                  else if (post.authorType === 'League') router.push(`/leagues/${post.authorId}`);
                  else if (post.authorType === 'Admin') router.push('/awards');
                  else router.push('/sponsors');
                }}
                onViewMatch={() => router.push('/matches/m1')}
              />
            ))}

            {filteredFeed.length === 0 && (
              <EmptyState
                title="No posts for this filter yet"
                description="The feed will never leave you on a blank page. Reset the filter to keep browsing today's active community moments."
                onReset={() => setActiveFilter('All')}
              />
            )}
          </div>
        </main>
      </div>

      <Button
        size="icon"
        aria-label="Create post"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 size-14 rounded-xl shadow-[0_0_36px_rgba(0,196,106,0.42)] md:bottom-8 md:right-8"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-6" />
      </Button>

      <CreatePostModal open={createOpen} onOpenChange={setCreateOpen} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
    </PageContainer>
  );
}
