'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { getPublicAppCheckToken } from '@/lib/firebase/client';

export function PublicInquiryForm({ type }: { type: 'sponsor' | 'league_pilot' }) {
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const appCheckToken = await getPublicAppCheckToken();
    const response = await fetch('/api/public-inquiries', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(appCheckToken ? { 'x-firebase-appcheck': appCheckToken } : {}),
      },
      body: JSON.stringify({
        type,
        name: form.get('name'),
        organization: form.get('organization'),
        email: form.get('email'),
        phone: form.get('phone'),
        sport: form.get('sport'),
        region: form.get('region'),
        scale: form.get('scale'),
        interest: form.get('interest'),
        preferredContact: form.get('preferredContact'),
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    setSubmitting(false);
    if (!response.ok) {
      setError(result?.error ?? 'Could not send the request. Please try again.');
      return;
    }
    setComplete(true);
  }

  if (complete) {
    return (
      <div className="border border-brand/30 bg-brand-subtle p-6" role="status">
        <CheckCircle className="h-8 w-8 text-brand" weight="fill" />
        <h2 className="mt-4 font-display text-2xl font-semibold text-text-strong">Request received</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Thank you. The GoalPlace256 pilot team will review the details and reply using your
          preferred contact method.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-border bg-surface-1 p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Your name" required />
        <Field name="organization" label={type === 'sponsor' ? 'Organization' : 'League name'} required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone" type="tel" required />
        <Select name="sport" label="Sport" options={['Football', 'Basketball', 'Rugby', 'Multiple sports']} />
        <Field name="region" label="Region or city" required />
        <Select
          name="scale"
          label={type === 'sponsor' ? 'Approximate budget' : 'Number of teams'}
          options={type === 'sponsor'
            ? ['Under UGX 5m', 'UGX 5m–20m', 'UGX 20m–50m', 'Above UGX 50m', 'Exploring']
            : ['4–8 teams', '9–16 teams', '17–32 teams', 'More than 32 teams']}
        />
        <Select name="preferredContact" label="Preferred contact" options={['Email', 'Phone', 'WhatsApp']} />
      </div>
      <label className="mt-4 block text-sm font-medium text-text-strong" htmlFor={`${type}-interest`}>
        {type === 'sponsor' ? 'Area of interest' : 'Biggest operational challenge'}
      </label>
      <textarea id={`${type}-interest`} name="interest" required maxLength={800} rows={4} className="mt-2 w-full border border-border bg-surface-2 p-3 text-sm text-text-strong outline-none focus:border-brand" />
      {error ? <p className="mt-4 text-sm text-[var(--state-error)]">{error}</p> : null}
      <Button type="submit" icon={PaperPlaneTilt} disabled={submitting} className="mt-5">
        {submitting ? 'Sending…' : type === 'sponsor' ? 'Request sponsor deck' : 'Request pilot conversation'}
      </Button>
    </form>
  );
}

function Field({ name, label, type = 'text', required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-text-strong">
      {label}
      <input name={name} type={type} required={required} maxLength={160} className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none focus:border-brand" />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <label className="block text-sm font-medium text-text-strong">
      {label}
      <select name={name} required className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none focus:border-brand">
        <option value="">Choose one</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
