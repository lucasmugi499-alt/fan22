export type InvitationDeliveryImportRow = {
  rowNumber: number;
  invitationId: string;
  channel: 'email';
};

export type InvitationDeliveryImportError = {
  rowNumber: number;
  field: 'file' | 'invitationId' | 'channel';
  message: string;
};

export function validateInvitationDeliveryRows(rows: unknown[]): {
  validRows: InvitationDeliveryImportRow[];
  errors: InvitationDeliveryImportError[];
} {
  if (rows.length > 100) {
    return {
      validRows: [],
      errors: [{ rowNumber: 1, field: 'file', message: 'A bulk delivery file may contain at most 100 rows.' }],
    };
  }
  const validRows: InvitationDeliveryImportRow[] = [];
  const errors: InvitationDeliveryImportError[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2;
    const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const invitationId = typeof data.invitationId === 'string' ? data.invitationId.trim() : '';
    const channel = typeof data.channel === 'string' ? data.channel.trim().toLowerCase() : '';
    if (!invitationId || invitationId.length > 180 || !/^[a-zA-Z0-9_-]+$/.test(invitationId)) {
      errors.push({ rowNumber, field: 'invitationId', message: 'Provide a valid invitation ID.' });
      continue;
    }
    if (seen.has(invitationId)) {
      errors.push({ rowNumber, field: 'invitationId', message: 'Duplicate invitation ID in this file.' });
      continue;
    }
    seen.add(invitationId);
    if (channel !== 'email') {
      errors.push({ rowNumber, field: 'channel', message: 'Email is the only configured delivery channel.' });
      continue;
    }
    validRows.push({ rowNumber, invitationId, channel: 'email' });
  }
  return { validRows, errors };
}
