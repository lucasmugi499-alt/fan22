export type RegistrationIntentKind = 'fan' | 'athlete_invitation' | 'operator_invitation';

export type RegistrationIntent = {
  kind: RegistrationIntentKind;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  accountStatus: 'active' | 'invited';
};

const FAN_REGISTRATION_INTENT: RegistrationIntent = {
  kind: 'fan',
  title: 'Create your fan account',
  description: 'Start following local leagues, teams, athletes, and fantasy competitions.',
  submitLabel: 'Create fan account',
  successMessage: 'Account created. Check your inbox to verify your email, then sign in.',
  accountStatus: 'active',
};

const ATHLETE_REGISTRATION_INTENT: RegistrationIntent = {
  kind: 'athlete_invitation',
  title: 'Create your athlete account',
  description: 'Use the invited email address so your Team Admin-created profile can move to League verification.',
  submitLabel: 'Create athlete account',
  successMessage: 'Athlete account created. Verify your email, then sign in from the invite link to accept your profile.',
  accountStatus: 'invited',
};

const OPERATOR_REGISTRATION_INTENT: RegistrationIntent = {
  kind: 'operator_invitation',
  title: 'Create your invited admin account',
  description: 'Use the invited email address. Admin access activates only after the server validates this invitation.',
  submitLabel: 'Create admin account',
  successMessage: 'Invited account created. Verify your email, then sign in from the invite link to accept the assignment.',
  accountStatus: 'invited',
};

export function registrationIntentForNextPath(nextPath?: string): RegistrationIntent {
  if (!nextPath?.startsWith('/')) return FAN_REGISTRATION_INTENT;

  let url: URL;
  try {
    url = new URL(nextPath, 'https://goalplace256.local');
  } catch {
    return FAN_REGISTRATION_INTENT;
  }

  if (url.pathname.startsWith('/athletes/') && url.searchParams.has('claim')) {
    return ATHLETE_REGISTRATION_INTENT;
  }

  if (url.pathname.startsWith('/invitations/access/') || url.pathname.startsWith('/invitations/team/')) {
    return OPERATOR_REGISTRATION_INTENT;
  }

  return FAN_REGISTRATION_INTENT;
}
