'use client';

import { useRef, useState } from 'react';
import { athleteLegalName } from '@/lib/athleteIdentity';
import { toast } from 'sonner';
import { HandHeart, Coins, DeviceMobile, SpinnerGap } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { cn } from '@/lib/utils';
import type { Athlete } from '@/types';
import type { SupportNeed } from '@/types';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { contributionQuote } from '@/lib/money';
import type { MobileMoneyProvider } from '@/types/money';

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
  const [paymentProvider, setPaymentProvider] = useState<MobileMoneyProvider>('airtel_money');
  const [providerStep, setProviderStep] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const checkoutSessionId = useRef<string | null>(null);

  const userId = currentUser?.uid ?? userProfile?.uid ?? userProfile?.id ?? 'guest';
  const chosen = custom !== '' ? Number(custom) : amount;
  const quote = Number.isSafeInteger(chosen) && chosen > 0 ? contributionQuote(chosen) : null;
  const firstName = athleteLegalName(athlete).split(' ')[0];

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

  async function pollStatus(intentId: string) {
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_500));
      const response = await fetch(`/api/payments/intents/${encodeURIComponent(intentId)}/status`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({})) as { status?: string };
      if (body.status === 'settled') {
        toast.success('Provider confirmation received. Your support is recorded.');
        return;
      }
      if (['failed', 'cancelled', 'held_for_review'].includes(body.status ?? '')) {
        toast.error(body.status === 'held_for_review'
          ? 'The payment is being reviewed before allocation.'
          : 'The provider did not complete the payment.');
        return;
      }
      setProviderStep('Waiting for provider confirmation...');
    }
    setProviderStep('Still processing. You can safely close this sheet and check Contributions later.');
  }

  async function support() {
    if (disabledReason) return;
    if (!currentUser && !isDemoMode) {
      toast.error('Sign in to support this athlete.');
      return;
    }
    setSubmitting(true);
    try {
      checkoutSessionId.current ??= crypto.randomUUID();
      setProviderStep(`Sending a ${paymentProvider === 'airtel_money' ? 'Airtel Money' : 'MTN MoMo'} prompt...`);
      const result = await provider.createContributionIntent({
        supporterUserId: userId,
        purpose: need ? 'verified_support_need' : 'direct_athlete_support',
        recipientType: 'athlete',
        recipientId: athlete.id,
        supportNeedId: need?.id,
        supportAmountMinor: chosen,
        message: message.trim() || undefined,
        customerPhone: phone || undefined,
        provider: paymentProvider,
        idempotencyKey: `support:${userId}:${need?.id ?? athlete.id}:${checkoutSessionId.current}`,
      });
      toast.success(isDemoMode
        ? `Synthetic support of UGX ${chosen.toLocaleString()} recorded. No money moved.`
        : result.message ?? 'Approve the mobile-money prompt on your phone.');
      if (!isDemoMode && result.id) {
        setProviderStep('Approve the prompt on your phone. GoalPlace will wait for verified provider status.');
        await pollStatus(result.id);
      }
      checkoutSessionId.current = null;
      if (isDemoMode) onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This support could not be recorded.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={need ? need.title : `Back ${firstName}`}
      description={need ? `${athlete.legalName} · verified need` : `${athlete.legalName} · ${athlete.registeredPosition}`}
      footer={
        <div className="space-y-2">
          {disabledReason ? <p className="text-center text-xs text-[var(--state-pending)]">{disabledReason}</p> : null}
          <Button block icon={submitting ? SpinnerGap : HandHeart} onClick={support} disabled={Boolean(disabledReason) || submitting}>
            {submitting ? 'Processing...' : `Support UGX ${Number.isFinite(chosen) ? chosen.toLocaleString() : 0}`}
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
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Mobile-money network</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mobile-money network">
                {([
                  ['airtel_money', 'Airtel Money', 'bg-[#e40000] text-white'],
                  ['mtn_momo', 'MTN MoMo', 'bg-[#ffcb05] text-black'],
                ] as const).map(([value, label, tone]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={paymentProvider === value}
                    onClick={() => setPaymentProvider(value)}
                    className={cn(
                      'flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border text-sm font-semibold transition-colors',
                      paymentProvider === value ? 'border-brand bg-brand-subtle text-text-strong' : 'border-border bg-surface-2 text-muted',
                    )}
                  >
                    <span className={cn('grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold', tone)}>
                      {value === 'airtel_money' ? 'A' : 'M'}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
          </div>
        ) : null}

        {/* Breakdown */}
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm">
          <Row label={`Allocated to ${firstName}`} value={`UGX ${quote?.recipientAllocationMinor.toLocaleString() ?? 0}`} strong />
          <Row label="GoalPlace service fee (5%)" value={`UGX ${quote?.platformFeeMinor.toLocaleString() ?? 0}`} />
          <div className="my-2 h-px bg-border" />
          <Row label="Total requested" value={`UGX ${quote?.totalAmountMinor.toLocaleString() ?? 0}`} />
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-2)]" weight="bold" />
          GoalPlace256 does not hold a reusable cash balance. A licensed PSP collects and settles each payment. Network or mobile-money charges may apply. In demo mode no money moves.
        </p>
        {providerStep ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-xs text-text">
            <DeviceMobile className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            {providerStep}
          </p>
        ) : null}
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
