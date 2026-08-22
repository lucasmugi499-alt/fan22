'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * The one shape every write in this console takes.
 *
 * A command dialog always asks for a reason, because the server always requires one and an
 * operator should meet that requirement while they still remember why they are here — not as
 * a 400 after they thought they were done. The reason lands in the audit trail, so the field
 * is labelled with who reads it rather than as a form chore.
 *
 * Destructive commands additionally ask the operator to type the object's name. That is not
 * ceremony: archive and delete are the two commands whose effect is invisible on the row
 * that triggered them, so typing the name is the only moment the operator is forced to
 * confirm they are looking at the object they think they are.
 */

export type CommandField =
  | { name: string; label: string; kind: 'text'; placeholder?: string; required?: boolean; maxLength?: number; defaultValue?: string }
  | { name: string; label: string; kind: 'textarea'; placeholder?: string; required?: boolean; maxLength?: number; defaultValue?: string }
  | { name: string; label: string; kind: 'select'; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string };

type CommandDialogProps = {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  fields?: CommandField[];
  /** When set, the operator must type this exactly before the command can be submitted. */
  confirmPhrase?: string;
  destructive?: boolean;
  running?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>, reason: string) => void;
  onClose: () => void;
};

/**
 * Closed dialogs unmount rather than hide.
 *
 * The body holds the operator's half-typed reason and field values, so mounting it fresh on
 * open is what clears them — no effect resetting state, and no chance of a previous
 * command's reason being submitted against the next object.
 */
export function CommandDialog(props: CommandDialogProps) {
  if (!props.open) return null;
  return <CommandDialogBody {...props} />;
}

function CommandDialogBody({
  title,
  description,
  submitLabel,
  fields = [],
  confirmPhrase,
  destructive = false,
  running = false,
  error,
  onSubmit,
  onClose,
}: CommandDialogProps) {
  const headingId = useId();
  // Initialized once on mount from the field defaults. `fields` is a fresh array literal on
  // every parent render, so reading it in an initializer rather than an effect is also what
  // stops the operator's typing being reset on each keystroke.
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])),
  );
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus moves into the dialog so a keyboard operator is not left behind on the page.
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const missingRequired = fields.some((field) => field.required && !values[field.name]?.trim());
  const reasonTooShort = reason.trim().length < 4;
  const confirmationMissing = Boolean(confirmPhrase) && typedConfirmation.trim() !== confirmPhrase;
  const blocked = running || missingRequired || reasonTooShort || confirmationMissing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-6"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {/* Card does not forward refs, so the dialog semantics and the focus target live on
          this wrapper rather than on the surface itself. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-lg"
      >
      <Card className="rounded-b-none p-5 sm:rounded-[var(--radius-lg)]">
        <h2 id={headingId} className="text-[17px] font-semibold text-text-strong">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>

        <div className="mt-4 space-y-3">
          {fields.map((field) => (
            <label key={field.name} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                {field.label}{field.required ? '' : ' (optional)'}
              </span>
              {field.kind === 'select' ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
                >
                  <option value="">Select…</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : field.kind === 'textarea' ? (
                <textarea
                  rows={3}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className="w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong"
                />
              ) : (
                <input
                  type="text"
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
                />
              )}
            </label>
          ))}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
              Reason for the audit trail
            </span>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="What is this change for? Whoever reads the audit trail will only have this sentence."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong"
            />
          </label>

          {confirmPhrase ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
                Type <code className="text-text-strong">{confirmPhrase}</code> to confirm
              </span>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--state-disputed)]">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-[var(--radius-md)] border border-border px-4 text-sm font-medium text-muted hover:text-text-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onSubmit(values, reason.trim())}
            className={cn(
              'min-h-11 rounded-[var(--radius-md)] px-4 text-sm font-semibold disabled:opacity-40',
              destructive
                ? 'bg-[var(--state-disputed)] text-white'
                : 'bg-brand text-on-brand',
            )}
          >
            {running ? 'Working…' : submitLabel}
          </button>
        </div>
      </Card>
      </div>
    </div>
  );
}
