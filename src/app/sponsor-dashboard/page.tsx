'use client';

import React, { useEffect, useState } from 'react';
import { Building2, HeartHandshake, LineChart } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer, SectionHeader, ImpactStatCard } from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { formatUGX } from '@/lib/sportThemes';
import { Sponsor } from '@/types';

export default function SponsorDashboardPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    let cancelled = false;
    dataProvider.getSponsors().then((items) => {
      if (!cancelled) setSponsors(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = sponsors.reduce((sum, sponsor) => sum + sponsor.amountCommitted, 0);

  return (
    <RoleGuard allowedRoles={['sponsor', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <SectionHeader eyebrow="Sponsor Dashboard" title="Impact reporting" />
        <div className="grid gap-3 md:grid-cols-3">
          <ImpactStatCard label="Active sponsors" value={String(sponsors.length)} icon={Building2} />
          <ImpactStatCard label="Committed support" value={formatUGX(total)} icon={HeartHandshake} tone="gold" />
          <ImpactStatCard label="Reports" value="Ready" icon={LineChart} tone="blue" />
        </div>
      </PageContainer>
    </RoleGuard>
  );
}
