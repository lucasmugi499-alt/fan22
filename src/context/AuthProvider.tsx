'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { logout as firebaseLogout, getUserProfile, getUserRole, listenToAuthState } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole, UserProfile } from '@/types';
import { AuthStatus } from '@/lib/auth/permissions';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (isFirebaseConfigured ? 'loading' : 'logged_out'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  
  // Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [, setDemoRoleState] = useState<AppRole | null>(null);

  const setDemoRole = useCallback((newRole: AppRole | null) => {
    if (newRole) {
      setIsDemoMode(true);
      setDemoRoleState(newRole);
      setUserProfile(MOCK_PROFILES[newRole]);
      setRole(newRole);
      setAuthStatus('logged_in');
      setCurrentUser({ uid: MOCK_PROFILES[newRole].uid, email: MOCK_PROFILES[newRole].email } as User);
    } else {
      setIsDemoMode(false);
      setDemoRoleState(null);
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
