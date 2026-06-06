'use client';

import React, { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';

type AuthModalContextValue = {
  isOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { authStatus } = useAuth();

  const openAuthModal = () => {
    if (authStatus !== 'logged_in') {
      setIsOpen(true);
    }
  };

  const closeAuthModal = () => setIsOpen(false);

  return (
    <AuthModalContext.Provider value={{ isOpen, openAuthModal, closeAuthModal }}>
      {children}
      <AuthRequiredModal isOpen={isOpen} onClose={closeAuthModal} />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}

function AuthRequiredModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05070A]/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0A0D14] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] shadow-[0_0_24px_rgba(0,196,106,0.3)]">
          <span className="font-heading font-black text-white">GP</span>
        </div>

        <h2 className="mb-2 font-heading text-2xl font-black text-white">Join GoalPlace256</h2>
        <p className="mb-8 text-sm text-slate-400">
          Create an account to support athletes, follow teams, earn GoalPlace Points, and join Uganda's grassroots sports community.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-xl bg-[var(--goal-emerald)] py-3.5 font-bold text-[#05070A] transition-colors hover:bg-[#00E67A]"
          >
            Login
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(pathname)}`}
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-3.5 font-bold text-white transition-colors hover:bg-white/10"
          >
            Create Account
          </Link>
          <button
            onClick={onClose}
            className="mt-2 text-sm font-bold text-slate-400 hover:text-white"
          >
            Continue Browsing
          </button>
        </div>
      </div>
    </div>
  );
}
