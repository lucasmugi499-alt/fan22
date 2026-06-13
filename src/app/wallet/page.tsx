'use client';

import React from 'react';
import Link from 'next/link';
import { Wallet01Icon, ArrowLeft01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AddFundsModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { DashboardStatGrid, ImpactStatCard, PageContainer, SectionHeader, StatusExplainerChip, SupportPledgeCard } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { useUserWalletTransactions } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';

export default function WalletPage() {
  const [fundsOpen, setFundsOpen] = React.useState(false);
  const { currentUser, userProfile } = useAuth();
  const { items } = useUserWalletTransactions(currentUser?.uid ?? userProfile?.uid);
  const availableBalance = userProfile?.walletBalance ?? 0;
  const heldAmount = items
    .filter((transaction) => transaction.type === 'pledge' || transaction.status === 'pending')
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const releasedAmount = items
    .filter((transaction) => transaction.status === 'completed' && transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const refundedAmount = items
    .filter((transaction) => transaction.type === 'refund')
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
          <ArrowLeft01Icon className="size-4" />
          Back
        </Link>
        <SectionHeader
          eyebrow="Wallet"
          title="Support wallet"
          description="Track available funds, held performance support, released support, refunds, and impact history."
        />
        <div className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-400">Available demo balance</p>
              <p className="mt-2 font-display text-4xl font-black text-white">{formatUGX(availableBalance)}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Demo support can be recorded here. Real payments are not enabled yet.
              </p>
            </div>
            <Button onClick={() => setFundsOpen(true)}>
              <Wallet01Icon className="size-4" />
              Add Demo Funds
            </Button>
          </div>
        </div>
        <DashboardStatGrid className="mt-5">
          <ImpactStatCard label="Available" value={formatUGX(availableBalance)} detail="Can be used for demo support actions." />
          <ImpactStatCard label="Pledged / Held" value={formatUGX(heldAmount)} detail="Held until performance verification." tone="gold" />
          <ImpactStatCard label="Released" value={formatUGX(releasedAmount)} detail="Verified support sent to athletes or teams." tone="emerald" />
          <ImpactStatCard label="Refunded" value={formatUGX(refundedAmount)} detail="Returned support from closed challenges." tone="blue" />
        </DashboardStatGrid>
        <div className="mt-5">
          <SupportPledgeCard
            title="Performance Support Rule"
            amount={formatUGX(heldAmount)}
            status="Held"
            detail="Pledged support is held until match or challenge verification, then released or refunded."
          />
        </div>
        <div className="mt-8 space-y-4">
          <SectionHeader title="Impact History" description="Your recent support, top-ups, releases, and refunds." />
          {items.length > 0 ? (
            <div className="space-y-3">
              {items.slice(0, 8).map((transaction) => (
                <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="font-bold text-white">{transaction.description ?? transaction.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
                      <StatusExplainerChip
                        domain="support"
                        status={transaction.type === 'refund' ? 'Refunded' : transaction.status === 'completed' ? 'Released' : transaction.status}
                      />
                    </div>
                  </div>
                  <p className={`mt-2 sm:mt-0 font-display text-lg font-black ${transaction.amount > 0 ? 'text-[var(--goal-mint)]' : 'text-slate-300'}`}>
                    {transaction.amount > 0 ? '+' : ''}{formatUGX(transaction.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-8 text-center">
              <p className="text-slate-300">No transactions yet.</p>
            </div>
          )}
        </div>
        <AddFundsModal open={fundsOpen} onOpenChange={setFundsOpen} />
      </PageContainer>
    </ProtectedRoute>
  );
}
