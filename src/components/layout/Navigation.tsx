import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, List, Calendar, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Feed', href: '/feed', icon: List },
    { name: 'Matches', href: '/matches', icon: Calendar },
    { name: 'Athletes', href: '/athletes', icon: Users },
    { name: 'Wallet', href: '/wallet', icon: Wallet },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-white/10 pb-safe">
      <nav className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "fill-primary/20")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'Feed', href: '/feed' },
    { name: 'Sports', href: '/sports' },
    { name: 'Matches', href: '/matches' },
    { name: 'Leagues', href: '/leagues' },
    { name: 'Athletes', href: '/athletes' },
    { name: 'Awards', href: '/awards' },
    { name: 'Sponsors', href: '/sponsors' },
  ];

  return (
    <div className="hidden md:flex sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/10 h-16 items-center px-8">
      <div className="flex items-center gap-2 mr-8">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-900 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-500/50">
          <span className="font-black text-white tracking-tighter text-sm">GP<span className="text-emerald-200">256</span></span>
        </div>
        <span className="font-black tracking-tight text-xl text-foreground">GoalPlace<span className="text-emerald-500">256</span></span>
      </div>
      
      <nav className="flex items-center gap-6 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "text-sm font-semibold transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="flex items-center gap-4">
        <Link href="/wallet" className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-2">
          <Wallet className="w-4 h-4"/> Wallet
        </Link>
        <Link href="/login" className="text-sm font-semibold bg-primary/20 text-primary hover:bg-primary/30 px-4 py-2 rounded-full transition-colors border border-primary/50">
          Login
        </Link>
      </div>
    </div>
  );
}
