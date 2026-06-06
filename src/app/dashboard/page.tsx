'use client';

import React from 'react';
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function Page() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen pt-24 pb-32">
        <div className="mx-auto max-w-4xl px-4 md:px-8">
          <div className="rounded-2xl border border-white/10 bg-[#0A0D14] p-8 shadow-2xl">
            <h1 className="font-heading text-3xl font-black text-white">{p.title}</h1>
            <p className="mt-2 text-slate-400">Welcome to your fan dashboard. Development is in progress.</p>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
