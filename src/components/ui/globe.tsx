'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const SportsGlobeCanvas = dynamic(() => import('./globe-canvas'), { ssr: false });

/**
 * Desktop-only WebGL globe. The three.js chunk is fetched on first mount, so gating the
 * mount on a media query also gates the download — a `hidden md:block` class would not,
 * and would still leave a live WebGL context and rAF loop running behind `display: none`.
 * Mirrors the smooth-scroll gate in AppShell.
 */
export function SportsGlobe() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (!enabled) return null;

  return <SportsGlobeCanvas />;
}

export function MobileNetworkOrb() {
  return (
    <div className="w-full aspect-square relative flex items-center justify-center md:hidden my-10">
      <div className="absolute inset-0 rounded-full border border-[var(--goal-emerald)]/30 animate-[spin_10s_linear_infinite] motion-reduce:animate-none" />
      <div className="absolute inset-4 rounded-full border border-[var(--goal-gold)]/20 animate-[spin_15s_linear_infinite_reverse] motion-reduce:animate-none" />
      <div className="absolute inset-8 rounded-full border border-[var(--goal-mint)]/20 animate-[spin_8s_linear_infinite] motion-reduce:animate-none" />
      <div className="absolute inset-12 bg-gradient-to-br from-[var(--goal-emerald)]/10 to-transparent rounded-full shadow-[0_0_40px_rgba(0,196,106,0.2)]" />
      <div className="size-16 rounded-full bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-mint)] shadow-[0_0_30px_rgba(0,196,106,0.4)] flex items-center justify-center">
        <span className="font-display font-black text-xs text-[#05070A]">GP256</span>
      </div>
    </div>
  );
}
