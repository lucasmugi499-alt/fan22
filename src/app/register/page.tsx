'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import Link from 'next/link';
import { PageContainer } from '@/components/ui/product';
import { Shield, User, Trophy, ChevronRight } from 'lucide-react';
import { AppRole } from '@/types';
import { toast } from 'sonner';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';

function RegisterContent() {
  const { setDemoRole } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedRole = searchParams.get('role') as AppRole | null;

  const handleDemoPreview = (selectedRole: AppRole) => {
    setDemoRole(selectedRole);
    toast.success(`Previewing as ${selectedRole.replace('_', ' ')}`);
    // Router will automatically be handled by AuthProvider/ProtectedRoute/RoleGuard logic mostly,
    // but we can enforce it by router.push
    router.push(getDefaultRouteForRole(selectedRole));
  };

  const roleOptions: { id: AppRole; title: string; description: string; icon: React.ElementType; color: string }[] = [
    { 
      id: 'fan', 
      title: 'Join as Fan', 
      description: 'Create a fan account to follow local sport, support athletes, save posts, comment, and earn GoalPlace Points.', 
      icon: User,
      color: 'text-blue-400'
    },
    { 
      id: 'athlete', 
      title: 'Register Athlete', 
      description: 'Create an athlete account to build your profile, receive support, join verified challenges, and showcase your progress.', 
      icon: Trophy,
      color: 'text-[var(--goal-gold)]'
    },
    { 
      id: 'league_admin', 
      title: 'League Admin', 
      description: 'Create a league admin account to manage teams, athletes, fixtures, results, verifications, and community updates.', 
      icon: Shield,
      color: 'text-red-400'
    }
  ];

  return (
    <div className="w-full overflow-hidden pb-24 pt-10 md:pt-16">
      <PageContainer>
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/50 bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] shadow-[0_0_28px_rgba(0,196,106,0.32)]">
              <span className="text-sm font-black tracking-tighter text-white">GP<span className="text-emerald-100">256</span></span>
            </div>
            <span className="font-heading text-xl font-black tracking-tight text-white">GoalPlace<span className="text-[var(--goal-mint)]">256</span></span>
          </Link>

          <div className="w-full rounded-2xl border border-white/10 bg-[#0A0D14] p-8 shadow-2xl">
            <h1 className="mb-2 text-center font-heading text-3xl font-black text-white">Create your account</h1>
            <p className="mb-8 text-center text-sm text-slate-400">
              Select how you want to use GoalPlace256
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              {roleOptions.map((role) => {
                const Icon = role.icon;
                const isSelected = preselectedRole === role.id;
                return (
                  <div
                    key={role.id}
                    className={`relative flex flex-col justify-between overflow-hidden rounded-xl border p-5 transition-all ${
                      isSelected 
                        ? 'border-[var(--goal-emerald)] bg-[var(--goal-emerald)]/10 shadow-[0_0_20px_rgba(0,196,106,0.15)]' 
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="mb-4 flex items-center gap-3">
                        <div className={`rounded-lg bg-black/30 p-2 ${role.color}`}>
                          <Icon className="size-5" />
                        </div>
                        <h3 className="font-heading text-lg font-black text-white">{role.title}</h3>
                      </div>
                      <p className="text-sm text-slate-400">{role.description}</p>
                    </div>

                    <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                      <button 
                        onClick={() => toast.error('Firebase Auth not yet connected. Use Preview instead.')}
                        className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
                      >
                        Sign Up
                      </button>
                      <button 
                        onClick={() => handleDemoPreview(role.id)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/10 py-2.5 px-3 text-xs font-bold text-[var(--goal-mint)] transition-colors hover:bg-[var(--goal-emerald)]/20"
                      >
                        Preview <ChevronRight className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center text-xs text-slate-400">
                Looking for Platform Admin? <span className="font-bold text-white">This role is invite-only.</span>
              </div>
              <div>
                <span className="text-slate-400">Already have an account? </span>
                <Link href="/login" className="ml-1 font-bold text-[var(--goal-mint)] hover:underline">
                  Login
                </Link>
              </div>
            </div>
            
            <p className="mt-6 text-center text-xs text-slate-500">
              Registration forms are currently mocked. Use &quot;Preview&quot; to jump straight into the application.
            </p>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterContent /></Suspense>;
}
