import { describe, expect, it } from 'vitest';
import {
  canReceivePayouts,
  decidePayeeTransition,
  emptyPayeeRecord,
  redactPayee,
  type PayeeAuthority,
  type PayeeStatus,
} from './athletePayee';

const decide = decidePayeeTransition;
const at = (status: PayeeStatus, submittedByUserId?: string) => ({ status, submittedByUserId });

describe('athlete payee authority', () => {
  it('lets a team invite a payee to come forward', () => {
    expect(decide({
      record: at('not_started'), action: 'invite', authority: 'team', actorUserId: 'team_admin_1',
    })).toEqual({ ok: true, nextStatus: 'invited' });
  });

  it.each(['team', 'league'] as PayeeAuthority[])(
    'refuses to let a %s submit or verify payout details',
    (authority) => {
      // The whole reason this module exists. A club official who can both invent an athlete
      // and name the account their supporters pay into is a fraud path, not a workflow.
      for (const action of ['submit', 'verify'] as const) {
        const outcome = decide({
          record: at(action === 'submit' ? 'invited' : 'submitted'),
          action, authority, actorUserId: 'club_official_1',
        });
        expect(outcome).toMatchObject({ ok: false });
        expect((outcome as { reason: string }).reason).toContain('may invite a payee');
      }
    },
  );

  it('lets the athlete submit through their own portal', () => {
    expect(decide({
      record: at('invited'), action: 'submit', authority: 'athlete',
      actorUserId: 'athlete_1', source: 'portal',
    })).toEqual({ ok: true, nextStatus: 'submitted' });
  });

  it('lets a guardian submit for a minor', () => {
    expect(decide({
      record: at('invited'), action: 'submit', authority: 'guardian',
      actorUserId: 'guardian_1', source: 'portal',
    })).toEqual({ ok: true, nextStatus: 'submitted' });
  });

  it('allows assisted submission only with evidence', () => {
    // An athlete with no phone must still be payable. An unevidenced assisted submission is
    // indistinguishable from an operator typing their own account into someone's record.
    const withoutEvidence = decide({
      record: at('invited'), action: 'submit', authority: 'platform',
      actorUserId: 'operator_1', source: 'platform_assisted',
    });
    expect(withoutEvidence).toMatchObject({ ok: false });
    expect((withoutEvidence as { reason: string }).reason).toContain('evidence');

    expect(decide({
      record: at('invited'), action: 'submit', authority: 'platform',
      actorUserId: 'operator_1', source: 'platform_assisted', evidenceRefs: ['uploads/consent-form.pdf'],
    })).toEqual({ ok: true, nextStatus: 'submitted' });
  });

  it('refuses to let a platform operator pose as the athlete', () => {
    const outcome = decide({
      record: at('invited'), action: 'submit', authority: 'platform',
      actorUserId: 'operator_1', source: 'portal',
    });
    expect(outcome).toMatchObject({ ok: false });
  });

  it('requires a second person to verify what was submitted', () => {
    // The control that makes assisted submission safe rather than a loophole.
    const selfVerify = decide({
      record: at('submitted', 'operator_1'), action: 'verify', authority: 'platform', actorUserId: 'operator_1',
    });
    expect(selfVerify).toMatchObject({ ok: false });
    expect((selfVerify as { reason: string }).reason).toContain('other than whoever submitted');

    expect(decide({
      record: at('submitted', 'operator_1'), action: 'verify', authority: 'platform', actorUserId: 'operator_2',
    })).toEqual({ ok: true, nextStatus: 'verified' });
  });

  it('re-checks a reinstated payee instead of waving it through', () => {
    expect(decide({
      record: at('suspended'), action: 'reinstate', authority: 'platform', actorUserId: 'operator_2',
    })).toEqual({ ok: true, nextStatus: 'submitted' });
  });

  it('pays out only against a verified record', () => {
    for (const status of ['not_started', 'invited', 'submitted', 'rejected', 'suspended'] as PayeeStatus[]) {
      expect(canReceivePayouts({ status })).toBe(false);
    }
    expect(canReceivePayouts({ status: 'verified' })).toBe(true);
  });

  it('tells a team whether an athlete can be paid without showing them the account', () => {
    const record = {
      ...emptyPayeeRecord('athlete_1', '2026-08-22T10:00:00.000Z'),
      status: 'verified' as const,
      detailsFingerprint: 'sha256:abc123',
      submittedByUserId: 'athlete_1',
    };
    const redacted = redactPayee(record);
    expect(redacted).toEqual({
      athleteId: 'athlete_1',
      status: 'verified',
      canReceivePayouts: true,
      hasDetailsOnFile: true,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(JSON.stringify(redacted)).not.toContain('sha256');
  });
});
