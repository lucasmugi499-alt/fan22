'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusSignIcon, SignalIcon, SecurityCheckIcon, SparklesIcon } from 'hugeicons-react';
import { Athlete } from '@/types';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/button';
import { FeedCard } from '@/components/ui/feed-card';
import { CommentsDrawer, CreatePostModal, SupportModal } from '@/components/modals/app-modals';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, StickyFilterBar } from '@/components/ui/product';
import { useAuthModal } from '@/components/auth/AuthRequiredModal';
import { useAuth } from '@/context/AuthProvider';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Following', 'Highlights', 'Verified', 'Awards'];

export default function FeedPage() {
  const router = useRouter();
  const { athletes, feedPosts } = useGoalPlaceData();
  const { openAuthModal } = useAuthModal();
  const { authStatus, role } = useAuth();
  const [activeFilter, setActiveFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);

  const getFeedHeader = () => {
    switch (role) {
      case 'athlete': return { eyebrow: 'Athlete Feed', title: 'Your Athlete Feed', description: 'Your posts, league updates, and match results.' };
      case 'league_admin':
      case 'team_admin': return { eyebrow: 'League Admin', title: 'League Operations Feed', description: 'League posts, team updates, match results, and verification updates.' };
      case 'platform_admin':
      case 'super_admin': return { eyebrow: 'Platform Admin', title: 'Platform Activity Feed', description: 'All platform posts, reports, and verification alerts.' };
      case 'fan':
      default: return { eyebrow: 'Community Feed', title: 'Your Sports Feed', description: 'Highlights, results, verified achievements, and community moments from Uganda\'s grassroots sport.' };
    }
  };
  const header = getFeedHeader();

  const filteredFeed = useMemo(() => {
    return feedPosts.filter((post) => {
      if (activeFilter === 'All') return true;
      if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return post.sport === activeFilter.toLowerCase();
      if (activeFilter === 'Following') return ['fan', 'athlete'].includes(post.authorRole);
      if (activeFilter === 'Highlights') return post.type === 'athlete_highlight';
      if (activeFilter === 'Verified') return post.type === 'verified_achievement';
      if (activeFilter === 'Awards') return post.type === 'annual_awards';
      return true;
    });
  }, [activeFilter, feedPosts]);

  const findAthlete = (authorId: string) => athletes.find((athlete) => athlete.id === authorId) ?? athletes[0] ?? null;

  return (
    <ProtectedRoute>
      
    <PageContainer compact className="max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <SectionHeader
            eyebrow={header.eyebrow}
            title={header.title}
            description={header.description}
          />
          <div className="hidden gap-3 lg:grid">
            <ImpactStatCard label="Live conversations" value="326" icon={SignalIcon} detail="Fans, teams, athletes, and leagues active today." />
            <ImpactStatCard label="Verified moments" value="41" icon={SecurityCheckIcon} tone="gold" detail="Confirmed achievements and match updates." />
            <ImpactStatCard label="Community reach" value="24k" icon={SparklesIcon} tone="blue" detail="Daily GoalPlace256 demo impressions." />
          </div>
        </aside>

        <main className="min-w-0">
          <StickyFilterBar filters={filters} active={activeFilter} onChange={setActiveFilter} />

          <div className="space-y-4">
            {filteredFeed.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                onSupport={() => {
                  if (authStatus !== 'logged_in') {
                    openAuthModal();
                  } else {
                    setSupportAthlete(findAthlete(post.authorId));
                  }
                }}
                onComment={() => {
                  if (authStatus !== 'logged_in') {
                    openAuthModal();
                  } else {
                    setCommentsOpen(true);
                  }
                }}
                onViewProfile={() => {
                  if (post.authorRole === 'athlete') router.push(`/athletes`);
                  else if (post.authorRole === 'team_admin') router.push(`/teams`);
                  else if (post.authorRole === 'league_admin') router.push(`/leagues`);
                  else router.push('/feed');
                }}
                onViewMatch={() => router.push('/matches')}
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
        onClick={() => {
          if (authStatus !== 'logged_in') {
            openAuthModal();
          } else {
            setCreateOpen(true);
          }
        }}
      >
        <PlusSignIcon className="size-6" />
      </Button>

      <CreatePostModal open={createOpen} onOpenChange={setCreateOpen} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
    </PageContainer>
  
    </ProtectedRoute>
);
}
