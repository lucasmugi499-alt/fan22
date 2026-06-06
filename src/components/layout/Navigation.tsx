import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Award,
  Calendar,
  Home,
  Landmark,
  List,
  LogIn,
  Handshake,
  Trophy,
  Users,
  Wallet,
  LayoutDashboard,
  User,
  ShieldCheck,
  Building2,
  Info,
  HelpCircle,
  Settings,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { AppRole } from '@/types';
import { toast } from 'sonner';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';

export function MobileNav() {
  const pathname = usePathname();
  const { authStatus, role } = useAuth();
  
  if (authStatus !== 'logged_in') {
    // Hide bottom nav on logged out marketing pages
    return null;
  }

  const getMobileItems = (role: AppRole | null) => {
    switch(role) {
      case 'athlete':
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Feed', href: '/feed', icon: List },
          { name: 'Matches', href: '/matches', icon: Calendar },
          { name: 'Dashboard', href: '/athlete-dashboard', icon: LayoutDashboard },
          { name: 'Wallet', href: '/wallet', icon: Wallet },
        ];
      case 'team_admin':
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Matches', href: '/matches', icon: Calendar },
          { name: 'Teams', href: '/teams', icon: Building2 },
          { name: 'Admin', href: '/team-admin', icon: LayoutDashboard },
          { name: 'Profile', href: '/profile', icon: User },
        ];
      case 'league_admin':
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Matches', href: '/matches', icon: Calendar },
          { name: 'Leagues', href: '/leagues', icon: Landmark },
          { name: 'Verify', href: '/league-admin', icon: ShieldCheck },
          { name: 'Profile', href: '/profile', icon: User },
        ];
      case 'sponsor':
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Feed', href: '/feed', icon: List },
          { name: 'Sponsors', href: '/sponsors', icon: Handshake },
          { name: 'Dashboard', href: '/sponsor-dashboard', icon: LayoutDashboard },
          { name: 'Profile', href: '/profile', icon: User },
        ];
      case 'platform_admin':
      case 'super_admin':
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Admin', href: '/admin', icon: ShieldCheck },
          { name: 'Verify', href: '/league-admin', icon: ShieldCheck },
          { name: 'Reports', href: '/admin', icon: List },
          { name: 'Profile', href: '/profile', icon: User },
        ];
      case 'fan':
      default:
        return [
          { name: 'Home', href: '/home', icon: Home },
          { name: 'Feed', href: '/feed', icon: List },
          { name: 'Matches', href: '/matches', icon: Calendar },
          { name: 'Athletes', href: '/athletes', icon: Users },
          { name: 'Wallet', href: '/wallet', icon: Wallet },
        ];
    }
  };

  const navItems = getMobileItems(role);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#05070A]/82 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_60px_rgba(0,0,0,0.36)] backdrop-blur-2xl lg:hidden">
      <nav className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition-colors",
                isActive ? "text-white" : "text-slate-400 hover:text-white"
              )}
            >
              <span
                className={cn(
                  "absolute top-2 h-1 w-7 rounded-full bg-gradient-to-r from-[var(--goal-emerald)] to-[var(--goal-gold)] opacity-0 transition-opacity",
                  isActive && "opacity-100"
                )}
              />
              <Icon className={cn("mt-1 size-5", isActive && "text-[var(--goal-mint)] drop-shadow-[0_0_12px_rgba(77,255,179,0.45)]")} />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function getDesktopNavItems(authStatus: string, role: AppRole | null) {
  if (authStatus !== 'logged_in') {
    return [
      { name: 'Home', href: '/', icon: Home },
      { name: 'About', href: '/about', icon: Info },
      { name: 'How It Works', href: '/how-it-works', icon: HelpCircle },
      { name: 'Sponsors', href: '/sponsors', icon: Handshake },
    ];
  }

  switch (role) {
    case 'athlete':
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Athletes', href: '/athletes', icon: Users },
      ];
    case 'team_admin':
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Teams', href: '/teams', icon: Building2 },
      ];
    case 'league_admin':
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
      ];
    case 'sponsor':
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Sports', href: '/sports', icon: Trophy },
        { name: 'Sponsors', href: '/sponsors', icon: Handshake },
      ];
    case 'platform_admin':
    case 'super_admin':
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
        { name: 'Athletes', href: '/athletes', icon: Users },
      ];
    case 'fan':
    default:
      return [
        { name: 'Home', href: '/home', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Sports', href: '/sports', icon: Trophy },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
        { name: 'Athletes', href: '/athletes', icon: Users },
        { name: 'Awards', href: '/awards', icon: Award },
      ];
  }
}

function AccountMenu() {
  const { userProfile, role, logout, setDemoRole } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!userProfile || !role) return null;

  const handleLogout = async () => {
    setDemoRole(null);
    await logout();
    setOpen(false);
    toast.success('Logged out successfully');
    router.push('/');
  };

  const dashboardRoute = getDefaultRouteForRole(role);

  return (
    <div className="relative">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-[var(--goal-emerald)]/40 bg-[var(--goal-emerald)]/10 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-[var(--goal-emerald)]/20"
      >
        <span className="truncate max-w-[100px]">{userProfile.name.split(' ')[0]}</span>
        <ChevronDown className="size-4 text-[var(--goal-mint)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0A0D14]/95 shadow-2xl backdrop-blur-xl z-50">
            <div className="border-b border-white/10 bg-white/5 p-4">
              <p className="font-bold text-white truncate">{userProfile.name}</p>
              <p className="text-xs text-[var(--goal-mint)] uppercase tracking-wider mt-1">{role.replace('_', ' ')}</p>
            </div>
            <div className="p-2 flex flex-col gap-1">
              <Link onClick={() => setOpen(false)} href={dashboardRoute} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
                <LayoutDashboard className="size-4" /> Dashboard
              </Link>
              <Link onClick={() => setOpen(false)} href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
                <User className="size-4" /> Profile
              </Link>
              {['fan', 'athlete', 'team_admin'].includes(role) && (
                <Link onClick={() => setOpen(false)} href="/wallet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--goal-gold)] hover:bg-white/10">
                  <Wallet className="size-4" /> Wallet
                </Link>
              )}
              <Link onClick={() => setOpen(false)} href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
                <Settings className="size-4" /> Settings
              </Link>
              <div className="my-1 border-t border-white/10" />
              <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
                <LogOut className="size-4" /> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  const { authStatus, role } = useAuth();
  
  const navItems = getDesktopNavItems(authStatus, role);
  const brandHref = authStatus === 'logged_in' ? '/home' : '/';

  return (
    <div className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-[#05070A]/76 px-4 shadow-[0_14px_60px_rgba(0,0,0,0.26)] backdrop-blur-2xl xl:px-8">
      <Link href={brandHref} className="mr-5 flex shrink-0 items-center gap-2 xl:mr-8">
        <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/50 bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] shadow-[0_0_28px_rgba(0,196,106,0.32)]">
          <span className="text-sm font-black tracking-tighter text-white">GP<span className="text-emerald-100">256</span></span>
        </div>
        <span className="hidden font-heading text-lg font-black tracking-tight text-white md:block xl:text-xl">GoalPlace<span className="text-[var(--goal-mint)]">256</span></span>
      </Link>
      
      <nav className="hidden flex-1 items-center gap-1 lg:flex lg:gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 transition-all hover:bg-white/6 hover:text-white xl:text-sm",
                isActive && "bg-white/8 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
              )}
            >
              <Icon className={cn("size-3.5", isActive && "text-[var(--goal-mint)]")} />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="flex shrink-0 items-center gap-2 ml-auto lg:ml-0">
        {authStatus === 'logged_in' ? (
          <AccountMenu />
        ) : (
          <>
            <Link href="/login" className="hidden lg:flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/5 xl:text-sm">
              <LogIn className="size-4" />
              Login
            </Link>
            <Link href="/register" className="flex items-center gap-2 rounded-lg bg-[var(--goal-emerald)] px-4 py-2 text-sm font-bold text-[#05070A] transition-colors hover:bg-[#00E67A]">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
