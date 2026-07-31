import { describe, expect, it } from 'vitest';
import { registrationIntentForNextPath } from './invitationIntent';

describe('registrationIntentForNextPath', () => {
  it('keeps ordinary self-service registration as fan access', () => {
    expect(registrationIntentForNextPath()).toMatchObject({
      kind: 'fan',
      submitLabel: 'Create fan account',
      accountStatus: 'active',
    });
    expect(registrationIntentForNextPath('/home')).toMatchObject({ kind: 'fan' });
  });

  it('recognises athlete claim links as athlete account setup', () => {
    expect(registrationIntentForNextPath('/athletes/athlete_1?claim=token_1')).toMatchObject({
      kind: 'athlete_invitation',
      title: 'Create your athlete account',
      accountStatus: 'invited',
    });
  });

  it('recognises trusted operator invitations as invited admin setup', () => {
    expect(registrationIntentForNextPath('/invitations/access/invite_1?token=token_1')).toMatchObject({
      kind: 'operator_invitation',
      submitLabel: 'Create admin account',
      accountStatus: 'invited',
    });
    expect(registrationIntentForNextPath('/invitations/team/team_invite_1?token=token_1')).toMatchObject({
      kind: 'operator_invitation',
    });
  });

  it('does not infer invitation intent from external paths', () => {
    expect(registrationIntentForNextPath('https://evil.test/invitations/access/invite_1')).toMatchObject({
      kind: 'fan',
    });
  });
});
