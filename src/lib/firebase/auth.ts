'use client';

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AppRole, UserProfile } from '@/types';
import { auth, db, isFirebaseConfigured, requireFirebaseClient } from './client';

export const demoAccounts: Array<{ label: string; email: string; role: AppRole; internal?: boolean }> = [
  { label: 'Fan Demo', email: 'fan@goalplace256.com', role: 'fan' },
  { label: 'Athlete Demo', email: 'athlete@goalplace256.com', role: 'athlete' },
  { label: 'League Admin Demo', email: 'league@goalplace256.com', role: 'league_admin' },
  { label: 'Platform Admin Demo', email: 'admin@goalplace256.com', role: 'platform_admin' },
  { label: 'Internal Team Demo', email: 'team@goalplace256.com', role: 'team_admin', internal: true },
  { label: 'Internal Platform Owner Demo', email: 'superadmin@goalplace256.com', role: 'super_admin', internal: true },
];

export function isAuthAvailable() {
  return Boolean(isFirebaseConfigured && auth && db);
}

export async function login(email: string, password: string) {
  const { auth } = requireFirebaseClient();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerAccount({
  email,
  password,
  name,
  accountStatus = 'active',
  pendingInvitationPath,
}: {
  email: string;
  password: string;
  name: string;
  accountStatus?: 'active' | 'invited';
  pendingInvitationPath?: string;
}) {
  const { auth, db } = requireFirebaseClient();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName: name });

  const profile: Omit<UserProfile, 'id'> = {
    uid: credential.user.uid,
    email,
    name,
    role: 'fan',
    accountStatus,
    status: 'active',
    points: 0,
    walletBalance: 0,
    followedAthletes: [],
    followedTeams: [],
    followedLeagues: [],
  };

  await setDoc(doc(db, 'users', credential.user.uid), {
    ...profile,
    ...(pendingInvitationPath ? { pendingInvitationPath } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await sendEmailVerification(credential.user);

  return credential;
}

export async function requestPasswordReset(email: string) {
  const { auth } = requireFirebaseClient();
  return sendPasswordResetEmail(auth, email);
}

export async function resendEmailVerification(user: User) {
  return sendEmailVerification(user);
}

export async function logout() {
  const { auth } = requireFirebaseClient();
  return signOut(auth);
}

export function listenToAuthState(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth?.currentUser ?? null;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as Omit<UserProfile, 'id'>) };
}

export async function getUserRole(user: User | null, profile?: UserProfile | null): Promise<AppRole | null> {
  if (!user) return null;
  const token = await user.getIdTokenResult();
  const claimRole = token.claims.role;

  return resolveTrustedRole(
    typeof claimRole === 'string' ? claimRole : null,
    profile?.role ?? null,
  );
}

const CLAIM_ROLES = new Set<AppRole>([
  'athlete',
  'team_admin',
  'league_admin',
  'sponsor',
  'platform_admin',
  'super_admin',
]);

export function resolveTrustedRole(
  claimRole: string | null,
  profileRole: AppRole | null,
): AppRole | null {
  if (claimRole && CLAIM_ROLES.has(claimRole as AppRole)) return claimRole as AppRole;
  // Fan is the only role a user may obtain through a client-created profile.
  return profileRole === 'fan' ? 'fan' : null;
}
