import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VerificationBadge({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1 bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-semibold", className)}>
      <CheckCircle2 className="w-3 h-3" />
      <span>Verified</span>
    </div>
  );
}
