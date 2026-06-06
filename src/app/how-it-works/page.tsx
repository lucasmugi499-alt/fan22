'use client';

import React from 'react';
import { PageContainer } from '@/components/ui/product';

export default function HowItWorksPage() {
  return (
    <div className="w-full overflow-hidden pb-24 pt-10 md:pt-16">
      <PageContainer>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-black text-white md:text-6xl">How GoalPlace256 Works</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Join the platform, follow your favorite sports, support athletes, and earn GoalPlace points.
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
