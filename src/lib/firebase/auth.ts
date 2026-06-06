'use client';

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AppRole, UserProfile } from '@/lib/types';
import { auth, db, isFirebaseConfigured, requireFirebaseClient } from './client';

export const demoAccounts: Array<{ label: string; email: string; role: AppRole }> = [
  { label: 'Fan Demo', email: 'fan@goalplace256.com', role: 'fan' },
  { label: 'Athlete Demo', email: 'athlete@goalplace256.com', role: 'athlete' },
  { label: 'Team Admin Demo', email: 'team@goalplace256.com', role: 'team_admin' },
  { label: 'League Admin Demo', email: 'league@goalplace256.com', role: 'league_admin' },
  { label: 'Sponsor Demo', email: 'sponsor@goalplace256.com', role: 'sponsor' },
  { label: 'Platform Admin Demo', email: 'admin@goalplace256.com', role: 'platform_admin' },
  { label: 'Super Admin Demo', email: 'superadmin@goalplace256.com', role: 'super_admin' },
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
  role,
}: {
  email: string;
  password: string;
  name: string;
  role: AppRole;
}) {
  const { auth, db } = requireFirebaseClient();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName: name });

  const pendingRoles: AppRole[] = ['athlete', 'team_admin', 'league_admin', 'sponsor'];
  const profile: Omit<UserProfile, 'id'> = {
    uid: credential.user.uid,
    email,
    name,
    role,
    status: pendingRoles.includes(role) ? 'pending' : 'active',
    points: 0,
    walletBalance: 0,
    followedAthletes: [],
    followedTeams: [],
    followedLeagues: [],
  };

  await setDoc(doc(db, 'users', credential.user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return credential;
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

  if (claimRole === 'platform_admin' || claimRole === 'super_admin') {
    return claimRole;
  }

  if (profile?.role === 'platform_admin' || profile?.role === 'super_admin') {
    return null;
  }

  return profile?.role ?? null;
}

export function routeForAppRole(role?: AppRole | null) {
  if (role === 'athlete') return '/athlete-dashboard';
  if (role === 'league_admin' || role === 'team_admin' || role === 'platform_admin' || role === 'super_admin') {
    return '/league-admin';
  }
  if (role === 'sponsor') return '/sponsors';
  return '/dashboard';
}
