'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { FileCsv, UploadSimple } from '@phosphor-icons/react';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { DirectoryRow, EmptyState, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthProvider';

type RawRow = { invitationId?: string; channel?: string };
type Preview = {
  rows: Array<{ rowNumber: number; invitationId: string; channel: string; valid: boolean; invitedEmail?: string; currentStatus?: string; error?: string }>;
  validCount: number;
  errorCount: number;
  errors: Array<{ rowNumber: number; field: string; message: string }>;
};

export function BulkInvitationImport() {
  const { currentUser, isDemoMode } = useAuth();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ attempted: number; succeeded: number; failed: number } | null>(null);

  async function previewRows(nextRows: RawRow[]) {
    if (!currentUser || typeof currentUser.getIdToken !== 'function') throw new Error('Sign in again to preview this import.');
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/platform/invitations/bulk', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'preview', rows: nextRows }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? 'The delivery batch could not be previewed.');
    setPreview(body.preview as Preview);
  }

  function readCsv(file?: File) {
    if (!file) return;
    setParsing(true);
    setError(null);
    setResult(null);
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data, errors }) => {
        if (errors.length) {
          setError(errors.map((item) => `Row ${(item.row ?? 0) + 2}: ${item.message}`).join(' '));
          setParsing(false);
          return;
        }
        setRows(data);
        try { await previewRows(data); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The delivery batch could not be previewed.'); }
        finally { setParsing(false); }
      },
      error: (cause) => { setError(cause.message); setParsing(false); },
    });
  }

  async function execute(reason: string, typedConfirmation: string) {
    if (!currentUser || typeof currentUser.getIdToken !== 'function') { setError('Sign in again to execute this import.'); return; }
    setRunning(true);
    setError(null);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/platform/invitations/bulk', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'execute', rows, reason, typedConfirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The invitation batch was refused.');
      setResult({ attempted: body.attempted, succeeded: body.succeeded, failed: body.failed });
      setOpen(false);
      await previewRows(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitation batch was refused.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><FileCsv className="h-5 w-5 text-brand" /><h2 className="text-[15px] font-semibold text-text-strong">Bulk invitation delivery</h2></div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">CSV columns: <code>invitationId,channel</code>. Email is the configured channel. Preview and execution use the same server validator; invalid rows are never sent.</p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border border-border bg-surface-2 px-4 text-sm font-semibold text-text-strong hover:bg-surface-3">
          <UploadSimple className="h-4 w-4" /> {parsing ? 'Checking…' : 'Choose CSV'}
          <input className="sr-only" type="file" accept=".csv,text/csv" disabled={parsing || isDemoMode} onChange={(event) => readCsv(event.target.files?.[0])} />
        </label>
      </div>
      {isDemoMode ? <p className="mt-3 text-xs text-muted">Demo sessions can inspect the workflow but cannot send real invitations.</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--state-error)]">{error}</p> : null}
      {result ? <p role="status" className="mt-3 text-sm text-brand">Attempted {result.attempted}: {result.succeeded} completed, {result.failed} failed.</p> : null}
      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2"><StatusChip label={`${preview.validCount} ready`} tone={preview.validCount ? 'good' : 'neutral'} /><StatusChip label={`${preview.errorCount} errors`} tone={preview.errorCount ? 'bad' : 'good'} /></div>
          {preview.errors.length ? <div className="space-y-2">{preview.errors.map((item) => <DirectoryRow key={`${item.rowNumber}-${item.field}-${item.message}`} title={`Row ${item.rowNumber} · ${item.field}`} meta={item.message} status="blocked" statusTone="bad" />)}</div> : null}
          {!preview.errors.length && preview.rows.length ? <div className="space-y-2">{preview.rows.map((item) => <DirectoryRow key={`${item.rowNumber}-${item.invitationId}`} title={item.invitedEmail ?? item.invitationId} meta={`Row ${item.rowNumber} · ${item.invitationId}`} status={item.currentStatus ?? 'ready'} statusTone="good" />)}</div> : null}
          {!preview.rows.length && !preview.errors.length ? <EmptyState title="No import rows">Choose a CSV containing at least one invitation ID.</EmptyState> : null}
          <PlatformCommandButton commandId="invitation.bulk_resend" onClick={() => setOpen(true)} disabledReason={preview.errorCount ? 'Resolve every row error before sending.' : !preview.validCount ? 'Add at least one valid invitation row.' : undefined} />
        </div>
      ) : null}
      <ConsequenceSheet
        open={open}
        commandId="invitation.bulk_resend"
        inputs={{ rowCount: preview?.validCount ?? 0 }}
        title={`Send ${preview?.validCount ?? 0} invitation${preview?.validCount === 1 ? '' : 's'}`}
        submitLabel="Send invitation batch"
        running={running}
        error={error}
        onClose={() => setOpen(false)}
        onSubmit={(values, reason) => void execute(reason, values.typedConfirmation)}
      />
    </Card>
  );
}
