'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { logout as firebaseLogout, getUserProfile, getUserRole, listenToAuthState } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole, UserProfile } from '@/lib/types';

type AuthContextValue = {
  currentUser: User | null;
  userProfile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  firebaseReady: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(Boolean(isFirebaseConfigured));

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    return listenToAuthState(async (user) => {
      setLoading(true);
      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const profile = await getUserProfile(user.uid);
      const nextRole = await getUserRole(user, profile);
      setUserProfile(profile);
      setRole(nextRole);
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      userProfile,
      role,
      loading,
      firebaseReady: isFirebaseConfigured,
      logout: firebaseLogout,
    }),
    [currentUser, userProfile, role, loading]
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
