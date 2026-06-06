'use client';

import React from 'react';
import { PageContainer } from '@/components/ui/product';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function TeamsPage() {
  return (
    <ProtectedRoute>
      <div className="w-full overflow-hidden pb-24 pt-10 md:pt-16">
        <PageContainer>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-heading text-4xl font-black text-white md:text-6xl">Teams</h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Browse teams across football, basketball, and rugby.
            </p>
          </div>
        </PageContainer>
      </div>
    </ProtectedRoute>
  );
}
