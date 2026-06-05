'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppRole } from '@/lib/types';
import { useAuth } from '@/context/AuthProvider';
import { ProtectedRoute, RouteGuardLoading } from './ProtectedRoute';

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: AppRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { firebaseReady, loading, role } = useAuth();

  const effectiveAllowed = role === 'super_admin' || allowedRoles.includes(role as AppRole);

  useEffect(() => {
    if (!firebaseReady || loading || effectiveAllowed) return;
    router.replace('/dashboard');
  }, [effectiveAllowed, firebaseReady, loading, router]);

  return (
    <ProtectedRoute>
      {firebaseReady && loading ? (
        <RouteGuardLoading label="Checking role" />
      ) : firebaseReady && !effectiveAllowed ? (
        <RouteGuardLoading label="Redirecting" />
      ) : (
        children
      )}
    </ProtectedRoute>
  );
}
