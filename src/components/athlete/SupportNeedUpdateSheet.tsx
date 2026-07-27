'use client';

import { useState } from 'react';
import { Check, FileArrowUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import type { SupportNeed } from '@/types';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

export function SupportNeedUpdateSheet({
  need,
  onClose,
  onSaved,
}: {
  need: SupportNeed | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [message, setMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  if (!need) return null;
  const selectedNeed = need;

  async function save() {
    if (!message.trim()) {
      toast.error('Explain what changed or how the support was used.');
      return;
    }
    if (selectedNeed.status === 'funded' && !evidenceUrl.trim()) {
      toast.error('Funded needs require a completion evidence link.');
      return;
    }
    setSaving(true);
    try {
      await provider.addSupportNeedUpdate(selectedNeed.id, {
        message: message.trim(),
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      toast.success(selectedNeed.status === 'funded'
        ? 'Completion evidence submitted for league review.'
        : 'Support update published.');
      onSaved();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The update could not be published.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={need.status === 'funded' ? 'Submit completion evidence' : 'Publish support update'}
      description={need.title}
      footer={<Button block icon={Check} onClick={save} disabled={saving}>{saving ? 'Publishing...' : 'Publish update'}</Button>}
    >
      <div className="space-y-4">
        <label className="block text-xs font-semibold uppercase text-subtle">
          Recipient update
          <textarea
            className="field mt-2 min-h-32 py-3 normal-case"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell supporters what happened and what this support enabled."
          />
        </label>
        <label className="block text-xs font-semibold uppercase text-subtle">
          Evidence link {need.status === 'funded' ? '(required)' : '(optional)'}
          <div className="relative mt-2">
            <FileArrowUp className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-subtle" />
            <input
              className="field pl-10 normal-case"
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="https://..."
            />
          </div>
        </label>
        <p className="text-xs leading-5 text-muted">Do not include identity documents, phone numbers, bank details, or a child&apos;s private location. Public evidence should show the item, service, or participation outcome only.</p>
      </div>
    </Sheet>
  );
}
