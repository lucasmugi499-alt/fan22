import { describe, expect, it } from 'vitest';
import { validateInvitationDeliveryRows } from './invitationImport';

describe('bulk invitation delivery validation', () => {
  it('returns valid rows and named row failures from one validator', () => {
    const result = validateInvitationDeliveryRows([
      { invitationId: 'invite_owner_1', channel: 'email' },
      { invitationId: '', channel: 'email' },
      { invitationId: 'invite_owner_1', channel: 'email' },
      { invitationId: 'invite_owner_2', channel: 'sms' },
    ]);

    expect(result.validRows).toEqual([{ rowNumber: 2, invitationId: 'invite_owner_1', channel: 'email' }]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 3, field: 'invitationId' }),
      expect.objectContaining({ rowNumber: 4, message: 'Duplicate invitation ID in this file.' }),
      expect.objectContaining({ rowNumber: 5, field: 'channel' }),
    ]));
  });

  it('refuses files beyond the governed batch size', () => {
    const result = validateInvitationDeliveryRows(Array.from({ length: 101 }, (_, index) => ({ invitationId: `invite_${index}`, channel: 'email' })));
    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0].message).toContain('100');
  });
});
