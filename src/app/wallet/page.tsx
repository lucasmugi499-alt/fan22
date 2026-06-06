'use client';

import React from 'react';
import { Wallet } from 'lucide-react';
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
              <p className="mt-2 font-heading text-4xl font-black text-white">{formatUGX(userProfile?.walletBalance ?? 0)}</p>
            </div>
            <Button onClick={() => setFundsOpen(true)}>
              <Wallet className="size-4" />
              Add Funds
            </Button>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {items.slice(0, 8).map((transaction) => (
            <div key={transaction.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="font-bold text-white">{transaction.description ?? transaction.label}</p>
              <p className="mt-1 text-sm text-slate-400">{formatUGX(transaction.amount)} - {transaction.status}</p>
            </div>
          ))}
        </div>
        <AddFundsModal open={fundsOpen} onOpenChange={setFundsOpen} />
      </PageContainer>
    </ProtectedRoute>
  );
}
