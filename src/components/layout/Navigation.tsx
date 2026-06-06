import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { AppRole } from '@/lib/types';

export function MobileNav() {
  const pathname = usePathname();
  const { authStatus } = useAuth();
  
  const loggedOutItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Feed', href: '/feed', icon: List },
    { name: 'Matches', href: '/matches', icon: Calendar },
    { name: 'Athletes', href: '/athletes', icon: Users },
    { name: 'Login', href: '/login', icon: LogIn },
  ];

  const loggedInItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Feed', href: '/feed', icon: List },
    { name: 'Matches', href: '/matches', icon: Calendar },
    { name: 'Athletes', href: '/athletes', icon: Users },
    { name: 'Wallet', href: '/wallet', icon: Wallet },
  ];

  const navItems = authStatus === 'logged_in' ? loggedInItems : loggedOutItems;

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
      { name: 'Feed', href: '/feed', icon: List },
      { name: 'Sports', href: '/sports', icon: Trophy },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Leagues', href: '/leagues', icon: Landmark },
      { name: 'Athletes', href: '/athletes', icon: Users },
      { name: 'Awards', href: '/awards', icon: Award },
      { name: 'Sponsors', href: '/sponsors', icon: Handshake },
    ];
  }

  switch (role) {
    case 'athlete':
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Athletes', href: '/athletes', icon: Users },
      ];
    case 'team_admin':
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Teams', href: '/teams', icon: Building2 }, // Using Building2 for Teams for now
      ];
    case 'league_admin':
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
      ];
    case 'sponsor':
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Sports', href: '/sports', icon: Trophy },
        { name: 'Sponsors', href: '/sponsors', icon: Handshake },
      ];
    case 'platform_admin':
    case 'super_admin':
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
        { name: 'Athletes', href: '/athletes', icon: Users },
      ];
    case 'fan':
    default:
      return [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Feed', href: '/feed', icon: List },
        { name: 'Sports', href: '/sports', icon: Trophy },
        { name: 'Matches', href: '/matches', icon: Calendar },
        { name: 'Leagues', href: '/leagues', icon: Landmark },
        { name: 'Athletes', href: '/athletes', icon: Users },
        { name: 'Awards', href: '/awards', icon: Award },
      ];
  }
}

export function DesktopNav() {
  const pathname = usePathname();
  const { authStatus, role } = useAuth();
  
  const navItems = getDesktopNavItems(authStatus, role);

  return (
    <div className="sticky top-0 z-50 hidden h-16 items-center border-b border-white/10 bg-[#05070A]/76 px-4 shadow-[0_14px_60px_rgba(0,0,0,0.26)] backdrop-blur-2xl lg:flex xl:px-8">
      <Link href="/" className="mr-5 flex shrink-0 items-center gap-2 xl:mr-8">
        <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/50 bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] shadow-[0_0_28px_rgba(0,196,106,0.32)]">
          <span className="text-sm font-black tracking-tighter text-white">GP<span className="text-emerald-100">256</span></span>
        </div>
        <span className="font-heading text-lg font-black tracking-tight text-white xl:text-xl">GoalPlace<span className="text-[var(--goal-mint)]">256</span></span>
      </Link>
      
      <nav className="flex flex-1 items-center gap-1 lg:gap-2">
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
      
      <div className="flex shrink-0 items-center gap-2">
        {authStatus === 'logged_in' ? (
          <>
            {['fan', 'athlete', 'team_admin'].includes(role || '') && (
              <Link href="/wallet" className="flex items-center gap-2 rounded-lg border border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10 px-3 py-2 text-xs font-black text-[var(--goal-gold)] transition-colors hover:bg-[var(--goal-gold)]/16 xl:text-sm">
                <Wallet className="size-4"/> Wallet
              </Link>
            )}
            
            <Link 
              href={
                role === 'athlete' ? '/athlete-dashboard' :
                role === 'team_admin' ? '/team-admin' :
                role === 'league_admin' ? '/league-admin' :
                role === 'sponsor' ? '/sponsor-dashboard' :
                role === 'platform_admin' || role === 'super_admin' ? '/admin' :
                '/dashboard'
              } 
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10 xl:text-sm"
            >
              {role === 'platform_admin' || role === 'super_admin' ? <ShieldCheck className="size-4"/> : <LayoutDashboard className="size-4" />}
              {
                role === 'athlete' ? 'Athlete Dash' :
                role === 'team_admin' ? 'Team Admin' :
                role === 'league_admin' ? 'League Admin' :
                role === 'sponsor' ? 'Sponsor Dash' :
                role === 'platform_admin' || role === 'super_admin' ? 'Admin' :
                'Dashboard'
              }
            </Link>
            
            <Link href="/profile" className="flex size-9 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/40 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)] hover:bg-[var(--goal-emerald)]/20 transition-colors">
              <User className="size-4" />
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/5 xl:text-sm">
              <LogIn className="size-4" />
              Login
            </Link>
            <Link href="/register" className="flex items-center gap-2 rounded-lg bg-[var(--goal-emerald)] px-3 py-2 text-xs font-bold text-[#05070A] transition-colors hover:bg-[#00E67A] xl:text-sm">
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
