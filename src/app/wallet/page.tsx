'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownToLine, CreditCard, HeartHandshake, History, Landmark, Plus, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import { mockCurrentUser, walletTransactions } from '@/lib/mockData';
import { formatUGX } from '@/lib/sportThemes';
import { AddFundsModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { GoalPlacePointsBadge, ImpactStatCard, PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';
import { cn } from '@/lib/utils';

const paymentMethods = ['MTN Mobile Money', 'Airtel Money', 'Flutterwave', 'Paystack', 'Card'];

export default function WalletPage() {
  const router = useRouter();
  const historyRef = useRef<HTMLDivElement>(null);
  const [addFundsOpen, setAddFundsOpen] = useState(false);

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Wallet"
        title="GoalPlace Wallet"
        description="A modern demo wallet for athlete support, active pledges, completed support, GoalPlace Points, and transparent history."
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel relative overflow-hidden rounded-xl p-5 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--goal-emerald)]/18 via-transparent to-[var(--rugby)]/14" />
          <div className="relative z-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-[var(--goal-mint)]">
                <WalletCards className="size-6" />
              </div>
              <GoalPlacePointsBadge points={mockCurrentUser.points} />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Available Balance</p>
            <h2 className="mt-2 font-heading text-5xl font-black text-white md:text-7xl">{formatUGX(mockCurrentUser.walletBalance)}</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              Use your demo wallet to support verified athletes, pledge performance rewards, and track community impact.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              <Button onClick={() => setAddFundsOpen(true)}><Plus className="size-4" /> Add Money</Button>
              <Button variant="outline" onClick={() => router.push('/athletes')}><HeartHandshake className="size-4" /> Support Athlete</Button>
              <Button variant="secondary" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}><History className="size-4" /> View History</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <ImpactStatCard label="Active pledges" value="6" icon={ShieldCheck} detail="Awaiting verified performance." />
          <ImpactStatCard label="Completed support" value="2.4M UGX" icon={HeartHandshake} tone="gold" detail="Demo support sent to athletes." />
          <ImpactStatCard label="Monthly impact" value="18 athletes" icon={Landmark} tone="blue" detail="Transport, meals, training, and recovery." />
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-panel rounded-xl p-5">
          <h2 className="font-heading text-2xl font-black text-white">Payment Methods</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Mock-only methods for the demo product flow.</p>
          <div className="mt-5 space-y-2">
            {paymentMethods.map((method) => (
              <div key={method} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="flex items-center gap-3 text-sm font-bold text-white">
                  <CreditCard className="size-4 text-[var(--goal-mint)]" />
                  {method}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Demo</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h2 className="font-heading text-2xl font-black text-white">Active Pledges</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Brian scores 1 goal', 'Daniel reaches 20 points', 'Grace gets 10 rebounds', 'Ivan makes 8 tackles'].map((pledge, index) => (
              <div key={pledge} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-black text-white">{pledge}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Release after verified performance confirmation.</p>
                <p className="mt-3 text-sm font-black text-[var(--goal-mint)]">{formatUGX([25000, 50000, 15000, 10000][index])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section ref={historyRef} className="mt-8">
        <SectionHeader
          eyebrow="History"
          title="Transaction history"
          action={<Button variant="outline" onClick={() => toast.success('Receipt downloaded in demo mode')}><ArrowDownToLine className="size-4" /> Download Receipt</Button>}
        />
        <div className="grid gap-3">
          {walletTransactions.map((transaction) => (
            <div key={transaction.id} className="glass-panel grid gap-3 rounded-xl p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className={cn('flex size-11 items-center justify-center rounded-xl border', transaction.amount > 0 ? 'border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10 text-[var(--goal-gold)]' : 'border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]')}>
                <ReceiptText className="size-5" />
              </div>
              <div>
                <p className="font-heading text-base font-black text-white">{transaction.label}</p>
                <p className="text-xs text-slate-400">{transaction.date} - {transaction.method} - {transaction.status}</p>
              </div>
              <p className={cn('font-heading text-lg font-black', transaction.amount > 0 ? 'text-[var(--goal-gold)]' : 'text-white')}>
                {transaction.amount > 0 ? '+' : ''}{typeof transaction.amount === 'number' && Math.abs(transaction.amount) < 1000 ? transaction.amount : `${transaction.amount.toLocaleString()} UGX`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <TrustNote />
      </section>

      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
    </PageContainer>
  );
}
