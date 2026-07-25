'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HandHeart, Coins } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Athlete, SupportPledge } from '@/types';

const PRESETS = [5_000, 10_000, 25_000, 50_000];
/** Platform fee on direct support; the rest reaches the athlete. */
const FEE_RATE = 0.05;

/**
 * The fan-side value loop: pick an amount, see exactly what reaches the athlete, and pledge.
 * In demo mode this moves local state only (wallet down, athlete support up, pledge into
 * history) via the same override pattern as the result flow; nothing here writes anything
 * official.
 */
export function SupportSheet({
  open,
  onClose,
  athlete,
}: {
  open: boolean;
  onClose: () => void;
  athlete: Athlete;
}) {
  const { userProfile } = useAuth();
  const { demoWalletSpent, addDemoPledge, addDemoWalletSpend, updateDemoAthlete } = useAppStore();
  const [amount, setAmount] = useState<number>(PRESETS[1]);
  const [custom, setCustom] = useState<string>('');
  const [message, setMessage] = useState('');

  const userId = userProfile?.id ?? userProfile?.uid ?? 'guest';
  const balance = (userProfile?.walletBalance ?? 0) - (demoWalletSpent[userId] ?? 0);
  const chosen = custom !== '' ? Number(custom) : amount;
  const fee = Math.round(chosen * FEE_RATE);
  const net = chosen - fee;
  const firstName = athlete.name.split(' ')[0];

  const valid = Number.isFinite(chosen) && chosen >= 1_000;
  const affordable = chosen <= balance;

  const disabledReason = useMemo(() => {
    if (!valid) return 'Minimum pledge is UGX 1,000';
    if (!affordable) return 'Not enough in your wallet for this amount';
    return null;
  }, [valid, affordable]);

  function pledge() {
    if (disabledReason) return;
    const now = new Date().toISOString();
    const record: SupportPledge = {
      id: `pledge_${Date.now()}`,
      fanId: userId,
      athleteId: athlete.id,
      amount: chosen,
      currency: 'UGX',
      type: 'direct_support',
      status: 'held',
      platformFee: fee,
      netAmount: net,
      message: message.trim() || undefined,
      createdAt: now,
    };
    addDemoPledge(record);
    addDemoWalletSpend(userId, chosen);
    updateDemoAthlete(athlete.id, {
      totalSupport: (athlete.totalSupport ?? 0) + net,
      supportersCount: (athlete.supportersCount ?? 0) + 1,
    });
    toast.success(`You backed ${firstName} with UGX ${chosen.toLocaleString()}.`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Back ${firstName}`}
      description={`${athlete.name} · ${athlete.position}`}
      footer={
        <div className="space-y-2">
          {disabledReason ? <p className="text-center text-xs text-[var(--state-pending)]">{disabledReason}</p> : null}
          <Button block icon={HandHeart} onClick={pledge} disabled={Boolean(disabledReason)}>
            Pledge UGX {Number.isFinite(chosen) ? chosen.toLocaleString() : 0}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Amount */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Amount</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => {
              const active = custom === '' && amount === p;
              return (
                <button
                  key={p}
                  onClick={() => { setAmount(p); setCustom(''); }}
                  className={cn(
                    'h-11 rounded-[var(--radius-md)] border text-sm font-semibold tabular-nums transition-colors',
                    active ? 'border-brand bg-brand-subtle text-brand' : 'border-border bg-surface-2 text-text hover:border-border-strong'
                  )}
                >
                  {p / 1000}k
                </button>
              );
            })}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={1000}
            placeholder="Custom amount (UGX)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm tabular-nums text-text-strong outline-none placeholder:text-subtle focus:border-brand"
          />
        </div>

        {/* Message */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Message <span className="text-subtle">(optional)</span></p>
          <input
            type="text"
            maxLength={120}
            placeholder={`Cheer ${firstName} on`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand"
          />
        </div>

        {/* Breakdown */}
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm">
          <Row label={`Reaches ${firstName}`} value={`UGX ${Number.isFinite(net) ? net.toLocaleString() : 0}`} strong />
          <Row label="Platform fee (5%)" value={`UGX ${Number.isFinite(fee) ? fee.toLocaleString() : 0}`} />
          <div className="my-2 h-px bg-border" />
          <Row label="Your wallet after" value={`UGX ${Math.max(0, balance - (Number.isFinite(chosen) ? chosen : 0)).toLocaleString()}`} />
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-2)]" weight="bold" />
          Funds are held until activity is verified, then released. In this demonstration build
          the pledge moves demo balances only.
        </p>
      </div>
    </Sheet>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted">{label}</span>
      <span data-numeric className={cn('tabular tabular-nums', strong ? 'font-bold text-brand' : 'font-medium text-text-strong')}>{value}</span>
    </div>
  );
}
