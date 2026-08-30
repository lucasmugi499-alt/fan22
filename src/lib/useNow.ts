'use client';

import { useState } from 'react';

/**
 * One timestamp, stable for the life of the component.
 *
 * Every list that separates fixtures still to play from fixtures already gone needs a "now",
 * and reading the clock during render is both impure — the boundary moves each time the
 * component happens to re-render, reordering a list somebody is reading — and flagged by the
 * React compiler's purity rule.
 *
 * Not a ticking clock. Nothing here needs second-by-second accuracy: the boundary it decides
 * is whether a kickoff has passed, and a page open long enough for that to matter has other
 * reasons to be reloaded.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
