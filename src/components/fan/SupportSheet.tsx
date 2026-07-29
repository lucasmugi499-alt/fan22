'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { HandHeart, Coins } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { cn } from '@/lib/utils';
import type { Athlete } from '@/types';
import type { SupportNeed } from '@/types';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { contributionQuote } from '@/lib/money';

const PRESETS = [5_000, 10_000, 25_000, 50_000];

/**
 * Starts a provider-owned contribution. Mock mode records a synthetic settlement; real
 * mode remains disabled until a licensed PSP is configured.
 */
export function SupportSheet({
  open,
  onClose,
  athlete,
  need,
}: {
  open: boolean;
  onClose: () => void;
  athlete: Athlete;
  need?: SupportNeed;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [amount, setAmount] = useState<number>(PRESETS[1]);
  const [custom, setCustom] = useState<string>('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const checkoutSessionId = useRef<string | null>(null);

  const userId = currentUser?.uid ?? userProfile?.uid ?? userProfile?.id ?? 'guest';
  const chosen = custom !== '' ? Number(custom) : amount;
  const quote = Number.isSafeInteger(chosen) && chosen > 0 ? contributionQuote(chosen) : null;
  const firstName = athlete.name.split(' ')[0];

  const valid = Number.isFinite(chosen) && chosen >= 1_000;
  const paymentsAvailable = isDemoMode || process.env.NEXT_PUBLIC_PAYMENTS_MODE === 'psp';
  const disabledReason = !valid
    ? 'Minimum support is UGX 1,000'
    : !paymentsAvailable
      ? 'Real payments are disabled until a licensed payment provider is configured'
      : paymentsAvailable && !isDemoMode && !phone
        ? 'Enter the mobile-money number that should receive the provider prompt'
      : paymentsAvailable && !isDemoMode && phone && !/^256\d{9}$/.test(phone)
        ? 'Use an Uganda number in 2567XXXXXXXX format'
        : null;

  async function pledge() {
    if (disabledReason) return;
    if (!currentUser && !isDemoMode) {
      toast.error('Sign in to support this athlete.');
      return;
    }
    setSubmitting(true);
    try {
      checkoutSessionId.current ??= crypto.randomUUID();
      await provider.createContributionIntent({
        supporterUserId: userId,
        purpose: need ? 'verified_support_need' : 'direct_athlete_support',
        recipientType: 'athlete',
        recipientId: athlete.id,
        supportNeedId: need?.id,
        supportAmountMinor: chosen,
        message: message.trim() || undefined,
        customerPhone: phone || undefined,
        idempotencyKey: `support:${userId}:${need?.id ?? athlete.id}:${checkoutSessionId.current}`,
      });
      toast.success(isDemoMode
        ? `Synthetic support of UGX ${chosen.toLocaleString()} recorded. No money moved.`
        : 'Continue with the licensed payment provider.');
      checkoutSessionId.current = null;
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This support pledge could not be recorded.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={need ? need.title : `Back ${firstName}`}
      description={need ? `${athlete.name} · verified need` : `${athlete.name} · ${athlete.position}`}
      footer={
        <div className="space-y-2">
          {disabledReason ? <p className="text-center text-xs text-[var(--state-pending)]">{disabledReason}</p> : null}
          <Button block icon={HandHeart} onClick={pledge} disabled={Boolean(disabledReason) || submitting}>
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

        {!isDemoMode && paymentsAvailable ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Mobile-money number</p>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="2567XXXXXXXX"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\s+/g, ''))}
              className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm tabular-nums text-text-strong outline-none placeholder:text-subtle focus:border-brand"
            />
          </div>
        ) : null}

        {/* Breakdown */}
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm">
          <Row label={`Allocated to ${firstName}`} value={`UGX ${quote?.recipientAllocationMinor.toLocaleString() ?? 0}`} strong />
          <Row label="GoalPlace service fee (5%)" value={`UGX ${quote?.platformFeeMinor.toLocaleString() ?? 0}`} />
          <Row label="Payment-provider fee" value="Shown at PSP checkout" />
          <div className="my-2 h-px bg-border" />
          <Row label="Total before PSP fee" value={`UGX ${quote?.totalAmountMinor.toLocaleString() ?? 0}`} />
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-2)]" weight="bold" />
          GoalPlace256 does not hold a reusable cash balance. A licensed PSP collects and settles each payment. In demo mode no money moves.
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
