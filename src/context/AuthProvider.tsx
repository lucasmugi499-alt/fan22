'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { logout as firebaseLogout, getUserProfile, getUserRole, listenToAuthState } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole, UserProfile } from '@/types';
import { AuthStatus } from '@/lib/auth/permissions';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { clearPrivateCaches } from '@/lib/offline';
import { mockProvider } from '@/data/providers/mockProvider';
import type { AccessContext, AccessIndexDocument } from '@/lib/auth/access';
import type { AccessIndexRecord } from '@/types';
import { resolveEffectiveRole } from '@/lib/auth/clientAccess';
import type { DemoLoginAccount } from '@/lib/auth/demoAccounts';
import { profileForDemoAccount } from '@/lib/auth/demoAccounts';

const demoRoleStorageKey = 'goalplace256.demoRole';
const demoAccountStorageKey = 'goalplace256.demoAccount';
const demoProfileStoragePrefix = 'goalplace256.demoProfile.';

type AuthContextValue = {
  authStatus: AuthStatus;
  currentUser: User | null;
  userProfile: UserProfile | null;
  role: AppRole | null;
  accountRole: AppRole | null;
  accessContext?: AccessContext;
  loading: boolean;
  firebaseReady: boolean;
  isDemoMode: boolean;
  setDemoRole: (role: AppRole | null, account?: DemoLoginAccount) => void;
  updateLocalProfile: (updates: Partial<UserProfile>) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isAppRole(value: string | null): value is AppRole {
  return Boolean(value && value in MOCK_PROFILES);
}

function getStoredDemoRole() {
  if (typeof window === 'undefined' || !isDemoModeEnabled) return null;
  const storedRole = window.sessionStorage?.getItem?.(demoRoleStorageKey) ?? getCookieDemoRole();
  return isAppRole(storedRole) ? storedRole : null;
}

function getCookieDemoRole() {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${demoRoleStorageKey}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  return value ? decodeURIComponent(value) : null;
}

function storeDemoRole(role: AppRole) {
  window.sessionStorage?.setItem?.(demoRoleStorageKey, role);
  document.cookie = `${demoRoleStorageKey}=${encodeURIComponent(role)}; path=/; SameSite=Lax`;
}

function clearStoredDemoRole() {
  window.sessionStorage?.removeItem?.(demoRoleStorageKey);
  document.cookie = `${demoRoleStorageKey}=; path=/; Max-Age=0; SameSite=Lax`;
}

function getStoredDemoAccount(role: AppRole): DemoLoginAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage?.getItem?.(demoAccountStorageKey);
    const account = value ? JSON.parse(value) as DemoLoginAccount : null;
    return account?.role === role ? account : null;
  } catch {
    return null;
  }
}

function storeDemoAccount(account: DemoLoginAccount) {
  window.sessionStorage?.setItem?.(demoAccountStorageKey, JSON.stringify(account));
}

function clearStoredDemoAccount() {
  window.sessionStorage?.removeItem?.(demoAccountStorageKey);
}

function getStoredDemoProfile(role: AppRole, account?: DemoLoginAccount): UserProfile {
  const base = MOCK_PROFILES[role];
  if (typeof window === 'undefined') return { ...base };
  try {
    const value = window.localStorage.getItem(`${demoProfileStoragePrefix}${role}`);
    const saved = value ? JSON.parse(value) as Partial<UserProfile> : {};
    const selected = account ? profileForDemoAccount(account) : undefined;
    return {
      ...base,
      ...saved,
      ...(selected ?? {}),
      id: selected?.id ?? base.id,
      uid: selected?.uid ?? base.uid,
      email: selected?.email ?? base.email,
      role: base.role,
      status: base.status,
    };
  } catch {
    return { ...base };
  }
}

function storeDemoProfile(role: AppRole, profile: UserProfile) {
  window.localStorage.setItem(`${demoProfileStoragePrefix}${role}`, JSON.stringify(profile));
}

function accessContextFromIndexes(userId: string, indexes: AccessIndexRecord[]): AccessContext {
  return {
    userId,
    indexes: indexes.map((index) => index as AccessIndexDocument),
    accessVersion: indexes.reduce((version, index) => Math.max(version, Number(index.accessVersion ?? 1)), 1),
  };
}

async function fetchTrustedAccessContext(user: User): Promise<AccessContext> {
  const token = await user.getIdToken();
  const response = await fetch('/api/access/context', {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as Partial<AccessContext> & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Scoped access context is unavailable.');
  return {
    userId: body.userId ?? user.uid,
    indexes: Array.isArray(body.indexes) ? body.indexes as AccessIndexDocument[] : [],
    accessVersion: Number(body.accessVersion ?? 1),
    teamLeagueIds: body.teamLeagueIds,
    athleteTeamIds: body.athleteTeamIds,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [accountRole, setAccountRole] = useState<AppRole | null>(null);
  const [accessContext, setAccessContext] = useState<AccessContext>();
  const [accessLoading, setAccessLoading] = useState(false);
  
  // Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [, setDemoRoleState] = useState<AppRole | null>(null);
  const [storageChecked, setStorageChecked] = useState(false);

  const setDemoRole = useCallback((newRole: AppRole | null, account?: DemoLoginAccount) => {
    if (newRole && isDemoModeEnabled) {
      const profile = getStoredDemoProfile(newRole, account);
      storeDemoRole(newRole);
      if (account) storeDemoAccount(account);
      else clearStoredDemoAccount();
      setIsDemoMode(true);
      setDemoRoleState(newRole);
      setUserProfile(profile);
      setAccountRole(newRole);
      setAuthStatus('logged_in');
      setCurrentUser({ uid: profile.uid, email: profile.email } as User);
    } else {
      setIsDemoMode(false);
      setDemoRoleState(null);
      clearStoredDemoRole();
      clearStoredDemoAccount();
      setUserProfile(null);
      setAccountRole(null);
      setAccessContext(undefined);
      setAccessLoading(false);
      setAuthStatus('logged_out');
      setCurrentUser(null);
      
      if (isFirebaseConfigured) {
        setAuthStatus('loading');
      }
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await clearPrivateCaches().catch(() => undefined);
    if (isDemoMode) {
      setDemoRole(null);
      window.location.assign('/');
      return;
    }
    await firebaseLogout();
  }, [isDemoMode, setDemoRole]);

  const updateLocalProfile = useCallback((updates: Partial<UserProfile>) => {
    setUserProfile((profile) => {
      if (!profile) return profile;
      const nextProfile = { ...profile, ...updates };
      if (isDemoMode && accountRole) storeDemoProfile(accountRole, nextProfile);
      return nextProfile;
    });
  }, [isDemoMode, accountRole]);

  useEffect(() => {
    const restoreDemoRole = window.setTimeout(() => {
      const storedDemoRole = getStoredDemoRole();

      if (storedDemoRole) {
        setDemoRole(storedDemoRole, getStoredDemoAccount(storedDemoRole) ?? undefined);
      } else if (!isFirebaseConfigured) {
        setAuthStatus('logged_out');
      }

      setStorageChecked(true);
    }, 0);

    return () => window.clearTimeout(restoreDemoRole);
  }, [setDemoRole]);

  useEffect(() => {
    if (!storageChecked || isDemoMode) return;

    if (!isFirebaseConfigured) {
      return;
    }

    return listenToAuthState(async (user) => {
      if (isDemoMode) return; // Prevent firebase updates while in demo mode
      
      setCurrentUser(user);

      if (!user) {
        void clearPrivateCaches();
        setUserProfile(null);
        setAccountRole(null);
        setAccessContext(undefined);
        setAccessLoading(false);
        setAuthStatus('logged_out');
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        const nextRole = await getUserRole(user, profile);
        setUserProfile(profile);
        setAccountRole(nextRole);
        setAuthStatus('logged_in');
      } catch (e) {
        console.error("Error fetching user profile:", e);
        setAuthStatus('logged_out');
      }
    });
  }, [isDemoMode, storageChecked]);

  useEffect(() => {
    const uid = currentUser?.uid ?? userProfile?.uid;
    if (authStatus !== 'logged_in' || !uid) {
      queueMicrotask(() => {
        setAccessContext(undefined);
        setAccessLoading(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setAccessLoading(true);
    });
    const accessContextPromise = isDemoMode
      ? mockProvider.getAccessIndexByUser(uid).then((indexes) => accessContextFromIndexes(uid, indexes))
      : currentUser
        ? fetchTrustedAccessContext(currentUser)
        : Promise.resolve(accessContextFromIndexes(uid, []));

    accessContextPromise
      .then((context) => {
        if (!cancelled) setAccessContext(context);
      })
      .catch((cause) => {
        console.warn('GoalPlace256: scoped access context could not be loaded.', cause);
        if (!cancelled) setAccessContext(accessContextFromIndexes(uid, []));
      })
      .finally(() => {
        if (!cancelled) setAccessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, currentUser, isDemoMode, userProfile?.uid]);

  useEffect(() => {
    document.documentElement.dataset.lowData = userProfile?.lowDataMode ? 'true' : 'false';
  }, [userProfile?.lowDataMode]);

  const role = useMemo(() => resolveEffectiveRole(accountRole, accessContext), [accountRole, accessContext]);

  const value = useMemo(
    () => ({
      authStatus,
      currentUser,
      userProfile,
      role,
      accountRole,
      accessContext,
      loading: authStatus === 'loading' || accessLoading,
      firebaseReady: isFirebaseConfigured,
      isDemoMode,
      setDemoRole,
      updateLocalProfile,
      logout: handleLogout,
    }),
    [authStatus, currentUser, userProfile, role, accountRole, accessContext, accessLoading, isDemoMode, setDemoRole, updateLocalProfile, handleLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return value;
}
