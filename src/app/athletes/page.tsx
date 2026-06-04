'use client';

import React, { useState } from 'react';
import { AthleteCard } from '@/components/ui/athlete-card';
import { mockAthletes } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

const filters = ['All Sports', 'Football', 'Basketball', 'Rugby', 'Top Supported', 'Verified Only'];

export default function AthletesPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All Sports');

  const filteredAthletes = mockAthletes.filter(athlete => {
    if (activeFilter === 'All Sports') return true;
    if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return athlete.sport === activeFilter;
    if (activeFilter === 'Verified Only') return athlete.verified;
    if (activeFilter === 'Top Supported') return athlete.supportersCount > 100;
    return true;
  });

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black mb-2 glow-text">Discover Athletes</h1>
        <p className="text-muted-foreground">Find and support the rising stars of African sport.</p>
      </div>

      <ScrollArea className="w-full whitespace-nowrap mb-8 pb-4">
        <div className="flex justify-center w-max mx-auto space-x-2">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-20">
        {filteredAthletes.map(athlete => (
          <AthleteCard key={athlete.id} athlete={athlete} onView={() => router.push(`/athletes/${athlete.id}`)} />
        ))}
        {filteredAthletes.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No athletes found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}
