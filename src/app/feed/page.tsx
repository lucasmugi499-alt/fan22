'use client';

import React, { useState } from 'react';
import { FeedCard } from '@/components/ui/feed-card';
import { mockFeed } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Following', 'Highlights', 'Verified', 'Awards'];

export default function FeedPage() {
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredFeed = mockFeed.filter(post => {
    if (activeFilter === 'All') return true;
    if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return post.sport === activeFilter;
    if (activeFilter === 'Verified') return post.verified;
    if (activeFilter === 'Highlights') return post.type === 'Highlight';
    return true; // Simplified for mock
  });

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 relative">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black mb-2 glow-text">Community Feed</h1>
        <p className="text-muted-foreground">Follow the moments, milestones, and athletes shaping grassroots sport.</p>
      </div>

      <ScrollArea className="w-full whitespace-nowrap mb-8 pb-4">
        <div className="flex w-max space-x-2">
          {filters.map(filter => (
            <Button
              key={filter}
              variant={activeFilter === filter ? 'default' : 'outline'}
              className={`rounded-full ${activeFilter !== filter ? 'bg-white/5 border-white/10' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      <div className="space-y-4 pb-20">
        {filteredFeed.map(post => (
          <FeedCard key={post.id} post={post} />
        ))}
        {filteredFeed.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            No posts found for this filter.
          </div>
        )}
      </div>

      {/* Floating Create Post Button */}
      <Button 
        size="icon" 
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-primary/90 z-50 md:bottom-12 md:right-12"
      >
        <Plus className="w-6 h-6" />
      </Button>
    </div>
  );
}
