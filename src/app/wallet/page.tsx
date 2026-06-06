'use client';

import React from 'react';
import { Wallet01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AddFundsModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { useUserWalletTransactions } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';

export default function WalletPage() {
  const [fundsOpen, setFundsOpen] = React.useState(false);
  const { currentUser, userProfile } = useAuth();
  const { items } = useUserWalletTransactions(currentUser?.uid ?? userProfile?.uid);

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <SectionHeader eyebrow="Wallet" title="Support wallet" />
        <div className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-400">Available demo balance</p>
              <p className="mt-2 font-display text-4xl font-black text-white">{formatUGX(userProfile?.walletBalance ?? 0)}</p>
            </div>
            <Button onClick={() => setFundsOpen(true)}>
              <Wallet01Icon className="size-4" />
              Add Funds
            </Button>
          </div>
        </div>
        <div className="mt-8 space-y-4">
          <SectionHeader title="Transaction History" description="Your recent pledges and top-ups." />
          {items.length > 0 ? (
            <div className="space-y-3">
              {items.slice(0, 8).map((transaction) => (
                <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="font-bold text-white">{transaction.description ?? transaction.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(transaction.createdAt).toLocaleDateString()} • {transaction.status}</p>
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
