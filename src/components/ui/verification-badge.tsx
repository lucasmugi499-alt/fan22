import React from 'react';
import { CheckmarkCircle01Icon } from 'hugeicons-react';
import { cn } from '@/lib/utils';

export function VerificationBadge({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1 bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-semibold", className)}>
      <CheckmarkCircle01Icon className="w-3 h-3" />
      <span>Verified</span>
    </div>
  );
}
