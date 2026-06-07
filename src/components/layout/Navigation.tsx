import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home01Icon, Building01Icon, Login01Icon, UserGroupIcon, Wallet01Icon, DashboardSquare01Icon, UserIcon, InformationCircleIcon, HelpCircleIcon, Settings01Icon, Logout01Icon, ArrowDown01Icon } from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { AppRole } from '@/types';
import { toast } from 'sonner';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';
import { ROLE_CONFIGS } from '@/lib/auth/roleConfig';

export function MobileNav() {
  const pathname = usePathname();
  const { authStatus, role } = useAuth();
  
  if (authStatus !== 'logged_in') {
    // Hide bottom nav on logged out marketing pages
    return null;
  }

  const getMobileItems = (currentRole: AppRole | null) => {
    // If the role exists in our new ROLE_CONFIGS, use it.
    let configRole = currentRole || 'fan';
    if (configRole === 'super_admin') configRole = 'platform_admin';
    if (configRole === 'sponsor') configRole = 'fan'; // Sponsor is just public now
    
    const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];
    return config.navItems;
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
      { name: 'Home', href: '/', icon: Home01Icon },
      { name: 'How It Works', href: '/#how-it-works', icon: HelpCircleIcon },
      { name: 'Sponsors', href: '/sponsors', icon: UserGroupIcon },
      { name: 'Pilot', href: '/pilot', icon: InformationCircleIcon },
    ];
  }

  let configRole = role || 'fan';
  if (configRole === 'super_admin') configRole = 'platform_admin';
  if (configRole === 'sponsor') configRole = 'fan';

  const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];
  
  // Mobile nav doesn't have enough space, but desktop we can add Sports/Awards etc based on role config
  // The role config navItems are mostly mobile focused, let's use them and add some extra items for desktop
  const desktopItems = [...config.navItems];
  
  if (configRole === 'fan') {
    desktopItems.push({ name: 'Leagues', href: '/leagues', icon: Building01Icon });
    desktopItems.push({ name: 'Awards', href: '/awards', icon: Trophy });
    desktopItems.push({ name: 'Profile', href: '/profile', icon: UserIcon });
  } else if (configRole === 'athlete') {
    desktopItems.push({ name: 'Wallet', href: '/wallet', icon: Wallet01Icon });
    desktopItems.push({ name: 'Settings', href: '/settings', icon: Settings01Icon });
  } else if (configRole === 'platform_admin') {
    desktopItems.push({ name: 'Sponsor Dashboard', href: '/sponsor-dashboard', icon: UserGroupIcon });
  }
  
  // Deduplicate by name just in case
  const uniqueItems = desktopItems.filter((item, index, self) =>
    index === self.findIndex((t) => (
      t.name === item.name
    ))
  );

  return uniqueItems;
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
        <ArrowDown01Icon className="size-4 text-[var(--goal-mint)]" />
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
                <DashboardSquare01Icon className="size-4" /> Dashboard
              </Link>
              <Link onClick={() => setOpen(false)} href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
                <UserIcon className="size-4" /> Profile
              </Link>
              {['fan', 'athlete'].includes(role) && (
                <Link onClick={() => setOpen(false)} href="/wallet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--goal-gold)] hover:bg-white/10">
                  <Wallet01Icon className="size-4" /> Wallet
                </Link>
              )}
              <Link onClick={() => setOpen(false)} href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
                <Settings01Icon className="size-4" /> Settings
              </Link>
              <div className="my-1 border-t border-white/10" />
              <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
                <Logout01Icon className="size-4" /> Logout
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
        <span className="hidden font-display text-lg font-black tracking-tight text-white md:block xl:text-xl">GoalPlace<span className="text-[var(--goal-mint)]">256</span></span>
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
              <Login01Icon className="size-4" />
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
