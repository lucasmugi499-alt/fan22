'use client';

import React from 'react';
import { StatusDomain, StatusExplainerChip } from './product';

export function VerificationBadge({
  className,
  status = 'verified',
  domain = 'athlete',
  showDetail = false,
}: {
  className?: string;
  status?: string;
  domain?: StatusDomain;
  showDetail?: boolean;
}) {
  return (
    <StatusExplainerChip domain={domain} status={status} showDetail={showDetail} className={className} />
  );
}
