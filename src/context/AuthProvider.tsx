'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { logout as firebaseLogout, getUserProfile, getUserRole, listenToAuthState } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole, UserProfile } from '@/types';
import { AuthStatus } from '@/lib/auth/permissions';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';

const demoRoleStorageKey = 'goalplace256.demoRole';

type AuthContextValue = {
  authStatus: AuthStatus;
  currentUser: User | null;
  userProfile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  firebaseReady: boolean;
  isDemoMode: boolean;
  setDemoRole: (role: AppRole | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isAppRole(value: string | null): value is AppRole {
  return Boolean(value && value in MOCK_PROFILES);
}

function getStoredDemoRole() {
  if (typeof window === 'undefined') return null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialDemoRole = getStoredDemoRole();
  const initialDemoProfile = initialDemoRole ? MOCK_PROFILES[initialDemoRole] : null;
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (initialDemoRole ? 'logged_in' : isFirebaseConfigured ? 'loading' : 'logged_out'));
  const [currentUser, setCurrentUser] = useState<User | null>(() => initialDemoProfile ? { uid: initialDemoProfile.uid, email: initialDemoProfile.email } as User : null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initialDemoProfile);
  const [role, setRole] = useState<AppRole | null>(initialDemoRole);
  
  // Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(Boolean(initialDemoRole));
  const [, setDemoRoleState] = useState<AppRole | null>(initialDemoRole);

  const setDemoRole = useCallback((newRole: AppRole | null) => {
    if (newRole) {
      storeDemoRole(newRole);
      setIsDemoMode(true);
      setDemoRoleState(newRole);
      setUserProfile(MOCK_PROFILES[newRole]);
      setRole(newRole);
      setAuthStatus('logged_in');
      setCurrentUser({ uid: MOCK_PROFILES[newRole].uid, email: MOCK_PROFILES[newRole].email } as User);
    } else {
      setIsDemoMode(false);
      setDemoRoleState(null);
      clearStoredDemoRole();
      setUserProfile(null);
      setRole(null);
      setAuthStatus('logged_out');
      setCurrentUser(null);
      
      // Trigger a re-check of firebase auth state if exiting demo mode
      if (isFirebaseConfigured) {
        setAuthStatus('loading');
        window.location.reload();
      }
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (isDemoMode) {
      setDemoRole(null);
      return;
    }
    await firebaseLogout();
  }, [isDemoMode, setDemoRole]);

  useEffect(() => {
    if (isDemoMode) return;

    if (!isFirebaseConfigured) {
      return;
    }

    return listenToAuthState(async (user) => {
      if (isDemoMode) return; // Prevent firebase updates while in demo mode
      
      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setRole(null);
        setAuthStatus('logged_out');
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        const nextRole = await getUserRole(user, profile);
        setUserProfile(profile);
        setRole(nextRole);
        setAuthStatus('logged_in');
      } catch (e) {
        console.error("Error fetching user profile:", e);
        setAuthStatus('logged_out');
      }
    });
  }, [isDemoMode]);

  const value = useMemo(
    () => ({
      authStatus,
      currentUser,
      userProfile,
      role,
      loading: authStatus === 'loading',
      firebaseReady: isFirebaseConfigured,
      isDemoMode,
      setDemoRole,
      logout: handleLogout,
    }),
    [authStatus, currentUser, userProfile, role, isDemoMode, setDemoRole, handleLogout]
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
