'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowCounterClockwise, Bell, CheckCircle, ShieldWarning, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthProvider';
import type { CommandField } from './CommandDialog';

type Preview = {
  commandId: string;
  label: string;
  tier: 'regular' | 'consequential' | 'governed' | 'quiet';
  targetId: string | null;
  targetLabel: string | null;
  changes: string[];
  remains: string[];
  notifications: string[];
  reversibility: string;
  blockers: string[];
  available: boolean;
  disabledReason: string | null;
  reasonRequired: boolean;
  acknowledgementRequired: boolean;
  confirmationPhrase: string | null;
  audit: { action: string; targetCollection: string; targetId: string | null };
  stateFingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

type ConsequenceSheetProps = {
  open: boolean;
  commandId: string;
  targetId?: string;
  inputs?: Record<string, unknown>;
  title?: string;
  fields?: CommandField[];
  submitLabel?: string;
  running?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>, reason: string, preview: Preview) => void;
  onClose: () => void;
};

export function ConsequenceSheet(props: ConsequenceSheetProps) {
  if (!props.open) return null;
  return <ConsequenceSheetBody {...props} />;
}

function ConsequenceSheetBody({
  commandId,
  targetId,
  inputs = {},
  title,
  fields = [],
  submitLabel = 'Run command',
  running = false,
  error,
  onSubmit,
  onClose,
}: ConsequenceSheetProps) {
  const { currentUser, isDemoMode } = useAuth();
  const headingId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])),
  );
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const serializedInputs = JSON.stringify(inputs);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => openerRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (isDemoMode) {
        setPreviewError('Demo sessions cannot preview or run commands against the real network.');
        setLoading(false);
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        setPreviewError('Sign in again to review this command.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setPreviewError(null);
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/platform/commands/preview', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ commandId, targetId, inputs: JSON.parse(serializedInputs) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'The consequence preview could not be loaded.');
        if (!cancelled) setPreview(payload.preview);
      } catch (cause) {
        if (!cancelled) setPreviewError(cause instanceof Error ? cause.message : 'The consequence preview could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPreview();
    return () => { cancelled = true; };
  }, [commandId, currentUser, isDemoMode, serializedInputs, targetId]);

  useEffect(() => {
    if (loading) return;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>('input, textarea, select, button:not([disabled])');
    first?.focus();
  }, [loading]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const missingRequired = fields.some((field) => field.required && !values[field.name]?.trim());
  const reasonMissing = Boolean(preview?.reasonRequired) && reason.trim().length < 4;
  const confirmationMissing = Boolean(preview?.confirmationPhrase)
    && confirmation.trim() !== preview?.confirmationPhrase;
  const acknowledgementMissing = Boolean(preview?.acknowledgementRequired) && !acknowledged;
  const blocked = running || loading || !preview?.available || missingRequired || reasonMissing || acknowledgementMissing || confirmationMissing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/55 sm:p-3"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="h-[min(92dvh,880px)] w-full max-w-xl overflow-y-auto rounded-t-[var(--radius-xl)] border border-border bg-surface-1 shadow-e3 motion-safe:animate-[sheetUp_var(--dur-drawer)_var(--ease-fluid)] sm:h-[calc(100dvh-1.5rem)] sm:rounded-[var(--radius-xl)]"
      >
        <header className="glass sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Consequence review</p>
            <h2 id={headingId} className="mt-1 text-xl font-semibold tracking-tight text-text-strong">
              {title ?? preview?.label ?? 'Review command'}
            </h2>
            {preview?.targetLabel ? <p className="mt-1 truncate text-xs text-muted">{preview.targetLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close consequence review" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text-strong">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-5 pb-8">
          {loading ? <PreviewSkeleton /> : null}
          {previewError ? (
            <Card className="border-[color-mix(in_srgb,var(--state-error),transparent_45%)] bg-[var(--state-error-bg)] p-4 text-sm text-[var(--state-error)]">
              {previewError}
            </Card>
          ) : null}

          {preview ? (
            <>
              {preview.blockers.length ? (
                <section aria-label="Command blockers" className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--state-error),transparent_45%)] bg-[var(--state-error-bg)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--state-error)]">
                    <ShieldWarning className="h-5 w-5" weight="fill" /> Command unavailable
                  </div>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-text">
                    {preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                </section>
              ) : null}

              <section className="grid gap-3 sm:grid-cols-2">
                <ConsequenceBlock icon={CheckCircle} title="What changes" items={preview.changes} />
                <ConsequenceBlock icon={ShieldWarning} title="What remains" items={preview.remains} />
                <ConsequenceBlock icon={Bell} title="Who is notified" items={preview.notifications.length ? preview.notifications : ['No automatic notification is recorded for this command.']} />
                <ConsequenceBlock icon={ArrowCounterClockwise} title="Reversibility" items={[preview.reversibility]} />
              </section>

              <section className="rounded-[var(--radius-lg)] bg-surface-2 p-4">
                <p className="text-xs font-semibold text-text-strong">Audit record</p>
                <p className="mt-1 break-words font-mono text-[11px] leading-5 text-muted">
                  {preview.audit.action} → {preview.audit.targetCollection}/{preview.audit.targetId ?? 'new record'}
                </p>
              </section>

              <div className="space-y-3">
                {fields.map((field) => (
                  <label key={field.name} className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      {field.label}{field.required ? '' : ' (optional)'}
                    </span>
                    {field.kind === 'select' ? (
                      <select className="field" value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>
                        <option value="">Select…</option>
                        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.kind === 'textarea' ? (
                      <textarea className="field min-h-24 py-2" rows={3} maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                    ) : (
                      <input className="field" type="text" maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                    )}
                  </label>
                ))}

                {preview.reasonRequired ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">Reason recorded in the audit trail</span>
                    <textarea className="field min-h-24 py-2" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State the evidence or operational need for this change." />
                  </label>
                ) : null}

                {preview.acknowledgementRequired ? (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-text">
                    <input className="mt-1 h-4 w-4 accent-[var(--brand)]" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                    I reviewed the live consequences, blockers, notifications, and reversibility above.
                  </label>
                ) : null}

                {preview.confirmationPhrase ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      Type <code className="text-text-strong">{preview.confirmationPhrase}</code> to confirm
                    </span>
                    <input className="field font-mono" type="text" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
                  </label>
                ) : null}
              </div>

              {error ? <p role="alert" className="text-sm leading-6 text-[var(--state-error)]">{error}</p> : null}

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  variant={preview.tier === 'governed' ? 'commandGoverned' : 'commandConsequential'}
                  disabled={blocked}
                  onClick={() => onSubmit({
                    ...values,
                    ...(preview.confirmationPhrase ? { typedConfirmation: confirmation.trim() } : {}),
                  }, reason.trim(), preview)}
                >
                  {running ? 'Working…' : submitLabel}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConsequenceBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof CheckCircle;
  title: string;
  items: string[];
}) {
  return (
    <section className="rounded-[var(--radius-lg)] bg-surface-2 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-text-strong">
        <Icon className="h-4 w-4 text-brand" aria-hidden /> {title}
      </div>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-label="Loading consequence preview" className="space-y-3">
      <div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-surface-2" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-surface-2" />
        <div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-surface-2" />
      </div>
    </div>
  );
}
