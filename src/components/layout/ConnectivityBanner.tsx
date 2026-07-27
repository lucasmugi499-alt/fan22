'use client';

import { useEffect, useState } from 'react';
import { CloudCheck, CloudSlash } from '@phosphor-icons/react';

export function ConnectivityBanner() {
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      setOnline((previous) => {
        setRestored(next && !previous);
        return next;
      });
      if (next) window.setTimeout(() => setRestored(false), 2400);
    };
    const initialCheck = window.setTimeout(update, 0);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online && !restored) return null;
  return (
    <div
      role="status"
      className={`sticky top-[var(--topbar-h)] z-40 flex min-h-9 items-center justify-center gap-2 px-3 text-xs font-semibold ${online ? 'bg-[var(--state-verified-bg)] text-verified' : 'bg-[var(--state-warning-bg)] text-warning'}`}
    >
      {online ? <CloudCheck className="h-4 w-4" weight="bold" /> : <CloudSlash className="h-4 w-4" weight="bold" />}
      {online ? 'Back online. Queued work can sync now.' : 'Offline. Last-loaded records and drafts remain available.'}
    </div>
  );
}
