'use client';

import React from 'react';
import { PageContainer } from '@/components/ui/product';

export default function AboutPage() {
  return (
    <div className="w-full overflow-hidden pb-24 pt-10 md:pt-16">
      <PageContainer>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-heading text-4xl font-black text-white md:text-6xl">About GoalPlace256</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            GoalPlace256 is Uganda&apos;s first unified platform dedicated to transforming grassroots sports.
            We bring together fans, athletes, teams, and sponsors to build a sustainable, verified sports ecosystem.
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
