'use client';

import React, { useState } from 'react';
import { MatchCard } from '@/components/ui/match-card';
import { mockMatches } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Live', 'Upcoming', 'Completed', 'Following'];

export default function MatchesPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredMatches = mockMatches.filter(match => {
    if (activeFilter === 'All') return true;
    if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return match.sport === activeFilter;
    if (['Live', 'Upcoming', 'Completed'].includes(activeFilter)) return match.status === activeFilter;
    return true; // Mock Following logic
  });

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black mb-2 glow-text">Match Center</h1>
        <p className="text-muted-foreground">Follow live action, check upcoming fixtures, and review results.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        {filteredMatches.map(match => (
          <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
        ))}
        {filteredMatches.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No matches found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}
